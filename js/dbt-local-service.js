import yaml from 'https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/+esm';

/**
 * Get conversion scripts from data ingestion module if available
 * @returns {Object} Object with sourceScript and destScript properties
 */
function getConversionScripts() {
  // Check if conversion scripts are available in global scope
  if (window.generatedConversionFiles) {
    return window.generatedConversionFiles;
  }
  return { sourceScript: null, destScript: null };
}

export function exportDbtLocalZip(schemaData, dbtRulesData, updateStatus, fileData) {
  if (!dbtRulesData) {
    updateStatus?.("DBT rules are required for local development. Please generate DBT rules first.", "danger");
    return;
  }
  if (!fileData?._originalFileContent) {
    updateStatus?.("Original dataset file is required for local development.", "danger");
    return;
  }

  if (typeof JSZip === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.onload = () => createDbtLocalZip(schemaData, dbtRulesData, updateStatus, fileData);
    document.head.appendChild(script);
  } else {
    createDbtLocalZip(schemaData, dbtRulesData, updateStatus, fileData);
  }
}

function createDbtLocalZip(schemaData, dbtRulesData, updateStatus, fileData) {
  const zip = new JSZip();
  const notify = msg => updateStatus?.(msg.text, msg.type);
  
  try {
    const rawDatasetName = fileData.name.replace(/\.(csv|xlsx?)$/i, '').replace(/^dataset-/, '');
    const datasetName = rawDatasetName
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^[0-9]+/, 'data_$&')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '');
    
    const datasetFileName = `dataset-${fileData.name}`;
    zip.file(datasetFileName, fileData._originalFileContent, { binary: true });

    createDbtProjectStructure(zip, datasetName, dbtRulesData, schemaData);
    zip.file("setup_dbt.sh", createSetupScript(datasetFileName, datasetName));
    zip.file("convert.py", createConvertPyScript(datasetFileName));
    
    // Add data ingestion conversion scripts if available
    const conversionScripts = getConversionScripts();
    if (conversionScripts.sourceScript) {
      zip.file("convert_to_source.py", conversionScripts.sourceScript);
    }
    if (conversionScripts.destScript) {
      zip.file("convert_to_destination.py", conversionScripts.destScript);
    }
    
    addDocumentationFiles(zip, schemaData, dbtRulesData);
    zip.file("README.md", createReadmeFile(datasetName, conversionScripts));

    zip.generateAsync({type: "blob"})
      .then(content => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(content);
        a.download = `dbt_local_project_${datasetName}_${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(a.href);
        }, 0);
        notify({text: "DBT local project exported successfully!", type: "success"});
      })
      .catch(() => notify({text: "Error generating DBT local project", type: "danger"}));

  } catch (error) {
    console.error("Error creating DBT local project:", error);
    notify({text: "Error creating DBT local project structure", type: "danger"});
  }
}

function createDbtProjectStructure(zip, datasetName, dbtRulesData, schemaData) {
  zip.file("dbt_project.yml", createProjectYml(datasetName));
  zip.file("profiles.yml", createProfilesYml(datasetName));
  zip.file("packages.yml", createPackagesYml());

  const modelsDir = zip.folder("models");
  
  if (dbtRulesData.dbtRules) {
    dbtRulesData.dbtRules.forEach(rule => {
      if (rule.modelSql) {
        const updatedSql = `-- Model for ${rule.tableName}\n${updateSqlForSeeds(rule.modelSql, rule.tableName)}`;
        modelsDir.file(`${rule.tableName}.sql`, updatedSql);
      }
    });
    modelsDir.file("schema.yml", createSchemaYmlFromRules(dbtRulesData, datasetName, schemaData));
  }
  
  zip.folder("seeds");
}

function updateSqlForSeeds(sql, tableName) {
  const seedRef = `{{ ref('${tableName.toLowerCase()}') }}`;
  const updatedSql = sql.replace(/\{\{\s*ref\(['"]\w+['"]\)\s*\}\}/gi, seedRef)
                        .replace(/FROM\s+[\w_]+(?![\w_])/gi, `FROM ${seedRef}`)
                        .replace(/(LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|JOIN)\s+[\w_]+(?![\w_])/gi, `$1 ${seedRef}`);
  return updatedSql.includes('SELECT') ? updatedSql : `SELECT * FROM ${seedRef}`;
}

function createProjectYml(datasetName) {
  return `name: '${datasetName}_analysis'
version: '1.0.0'
config-version: 2
profile: '${datasetName}_profile'
model-paths: ["models"]
analysis-paths: ["analyses"]
test-paths: ["tests"]
seed-paths: ["seeds"]
macro-paths: ["macros"]
snapshot-paths: ["snapshots"]
target-path: "target"
clean-targets:
  - "target"
  - "dbt_packages"
models:
  ${datasetName}_analysis:
    materialized: table
`;
}

function createProfilesYml(datasetName) {
  return `${datasetName}_profile:
  target: dev
  outputs:
    dev:
      type: duckdb
      path: '${datasetName}.duckdb'
      threads: 1
`;
}

function createPackagesYml() {
  return `packages:
  - package: dbt-labs/dbt_utils
    version: 1.1.1
`;
}

function createSchemaYmlFromRules(dbtRulesData, datasetName, schemaData) {
  const schemaObj = { version: 2, models: [], seeds: [] };

  const actualColumns = new Set();
  schemaData.schemas?.forEach(tbl => {
    tbl.columns?.forEach(col => actualColumns.add(col.name));
  });

  const modelColumnTests = new Set();

  dbtRulesData.dbtRules.forEach(rule => {
    const model = { name: rule.tableName, description: `Model derived from seed: ${datasetName}`, columns: [] };

    rule.tests?.forEach(test => {
      if (!actualColumns.has(test.column)) return;
      
      modelColumnTests.add(test.column);
      const col = { name: test.column, tests: [] };

      test.tests?.forEach(t => {
        if (typeof t === 'string') {
          col.tests.push(t);
        } else if (t && typeof t === 'object') {
          const key = Object.keys(t)[0];
          const value = t[key];
          col.tests.push({ [key]: Array.isArray(value) || typeof value === 'object' ? value : String(value) });
        }
      });

      test.relationships?.forEach(rel => {
        col.tests.push({ 
          [rel.test]: { 
            arguments: { 
              to: rel.to, 
              field: rel.field 
            }
          } 
        });
      });

      col.tests = deduplicateTests(col.tests);
      if (col.tests.length > 0) model.columns.push(col);
    });

    if (model.columns.length > 0) schemaObj.models.push(model);
  });

  // Create separate seed entries for each table/schema
  schemaData.schemas?.forEach(tbl => {
    const tableName = tbl.tableName.toLowerCase(); // Convert to lowercase for consistency
    const seed = { 
      name: tableName, 
      description: `${tbl.description || `Data for ${tbl.tableName} table`}`, 
      columns: [] 
    };

    tbl.columns?.forEach(col => {
      const seedCol = { name: col.name, description: col.description || '' };
      
      if (!modelColumnTests.has(col.name)) {
        const tests = [];
        if (col.isPrimaryKey) tests.push('not_null', 'unique');
        col.constraints?.forEach(c => {
          if (c.toLowerCase().includes('not null')) tests.push('not_null');
          if (c.toLowerCase().includes('unique')) tests.push('unique');
        });
        const uniqueTests = [...new Set(tests)];
        if (uniqueTests.length) seedCol.tests = uniqueTests;
      }
      
      seed.columns.push(seedCol);
    });

    if (seed.columns.length > 0) {
      schemaObj.seeds.push(seed);
    }
  });
  return yaml.dump(schemaObj, { noRefs: true, lineWidth: -1 });
}

function deduplicateTests(tests) {
  const seen = new Set();
  return tests.filter(t => {
    const key = typeof t === 'string' ? t : JSON.stringify(t);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createConvertPyScript(datasetFileName) {
  return `# /// script
# requires-python = '>=3.12'
# dependencies = ['pandas>=2.0.0', 'openpyxl>=3.1.0', 'xlrd>=2.0.0', 'duckdb>=0.8.0']
# ///

import pandas as pd
import os
import re
import shutil
from pathlib import Path

dataset_file = '${datasetFileName}'
original_name = dataset_file.replace('dataset-', '').replace('.xlsx', '').replace('.csv', '')
sanitized_name = re.sub(r'[^a-zA-Z0-9_]', '_', original_name)
sanitized_name = re.sub(r'^[0-9]+', r'data_\\g<0>', sanitized_name)
sanitized_name = re.sub(r'_{2,}', '_', sanitized_name)
sanitized_name = sanitized_name.strip('_')

# Create both data directory and seeds directory for DBT
data_dir = 'converted_data'
seeds_dir = 'seeds'

print(f'Converting {dataset_file} to CSV format(s)...')
os.makedirs(data_dir, exist_ok=True)
os.makedirs(seeds_dir, exist_ok=True)

if dataset_file.lower().endswith('.csv'):
    df = pd.read_csv(dataset_file)
    # Save to both directories
    data_output = f'{data_dir}/{sanitized_name}.csv'
    seeds_output = f'{seeds_dir}/{sanitized_name}.csv'
    
    df.to_csv(data_output, index=False)
    df.to_csv(seeds_output, index=False)
    
    print(f'✅ Dataset converted and saved to:')
    print(f'   📁 {data_output}')
    print(f'   📁 {seeds_output} (for DBT)')
    print(f'📊 Dataset shape: {df.shape[0]} rows, {df.shape[1]} columns')

elif dataset_file.lower().endswith(('.xlsx', '.xls')):
    # Handle Excel files with multiple sheets
    excel_file = pd.ExcelFile(dataset_file)
    sheet_names = excel_file.sheet_names
    
    print(f'📋 Found {len(sheet_names)} sheet(s): {", ".join(sheet_names)}')
    
    if len(sheet_names) == 1:
        # Single sheet - use original naming
        df = pd.read_excel(dataset_file, sheet_name=sheet_names[0])
        data_output = f'{data_dir}/{sanitized_name}.csv'
        seeds_output = f'{seeds_dir}/{sanitized_name}.csv'
        
        df.to_csv(data_output, index=False)
        df.to_csv(seeds_output, index=False)
        
        print(f'✅ Sheet "{sheet_names[0]}" converted and saved to:')
        print(f'   📁 {data_output}')
        print(f'   📁 {seeds_output} (for DBT)')
        print(f'📊 Dataset shape: {df.shape[0]} rows, {df.shape[1]} columns')
    else:
        # Multiple sheets - create separate CSV for each sheet
        for i, sheet_name in enumerate(sheet_names, 1):
            df = pd.read_excel(dataset_file, sheet_name=sheet_name)
            # Sanitize sheet name for filename
            sheet_sanitized = re.sub(r'[^a-zA-Z0-9_]', '_', sheet_name)
            sheet_sanitized = re.sub(r'^[0-9]+', r'data_\\g<0>', sheet_sanitized)
            sheet_sanitized = re.sub(r'_{2,}', '_', sheet_sanitized).strip('_')
            
            # Use table1, table2, etc. naming for clarity
            table_name = f'table{i}_{sheet_sanitized}'
            data_output = f'{data_dir}/{table_name}.csv'
            seeds_output = f'{seeds_dir}/{table_name}.csv'
            
            df.to_csv(data_output, index=False)
            df.to_csv(seeds_output, index=False)
            
            print(f'✅ Sheet "{sheet_name}" converted and saved as:')
            print(f'   📁 {data_output}')
            print(f'   📁 {seeds_output} (for DBT)')
            print(f'📊 Sheet shape: {df.shape[0]} rows, {df.shape[1]} columns')

else:
    raise ValueError(f'Unsupported file format: {dataset_file}')

print(f'🎉 Conversion complete!')
print(f'📁 Data files: Check the {data_dir}/ directory')
print(f'📁 DBT seeds: Check the {seeds_dir}/ directory')`;
}

function createSetupScript(datasetFileName, datasetName) {
  return `#!/bin/bash
set -e

# Create log file with timestamp
LOG_FILE="schemaforge.$(date +%Y-%m-%d-%H-%M-%S).log"
echo "📝 Logging output to: $LOG_FILE"

# Function to log both to terminal and file
log_and_echo() {
    echo "$1" | tee -a "$LOG_FILE"
}

# Start logging
{
    echo "=== SchemaForge DBT Setup Log ==="
    echo "Started at: $(date)"
    echo "Dataset: $datasetName"
    echo "==============================="
    echo
} > "$LOG_FILE"

log_and_echo "🔧 Setting up DBT local development environment..."

if ! command -v uv &> /dev/null; then
    log_and_echo "❌ Error: uv is not installed. Please install it first."
    exit 1
fi

log_and_echo "🔄 Converting dataset to CSV format..."
uv run convert.py 2>&1 | tee -a "$LOG_FILE"

log_and_echo "🎯 Initializing DBT project..."
export DBT_PROFILES_DIR=$(pwd)

export dbt='uvx --with dbt-core,dbt-duckdb dbt'

log_and_echo "📦 Installing DBT dependencies..."
$dbt deps 2>&1 | tee -a "$LOG_FILE"

log_and_echo "🔗 Testing DBT connection..."
$dbt debug 2>&1 | tee -a "$LOG_FILE"

log_and_echo "🌱 Loading seeds into database..."
$dbt seed 2>&1 | tee -a "$LOG_FILE"

log_and_echo "🏗️ Running DBT models..."
$dbt run 2>&1 | tee -a "$LOG_FILE"

log_and_echo "🧪 Running DBT tests..."
$dbt test 2>&1 | tee -a "$LOG_FILE"

log_and_echo "📖 Generating DBT documentation..."
$dbt docs generate 2>&1 | tee -a "$LOG_FILE"

{
    echo
    echo "==============================="
    echo "Completed at: $(date)"
    echo "==============================="
} >> "$LOG_FILE"

log_and_echo "🎉 DBT local development setup complete!"
log_and_echo "📁 Project structure created with ${datasetName}.duckdb database"
log_and_echo "🚀 Run 'dbt docs serve' to view documentation"
log_and_echo "📝 Full log saved to: $LOG_FILE"`;
}

function addDocumentationFiles(zip, schemaData, dbtRulesData) {
  const files = {
    "docs/schema_overview.md": generateSchemaMarkdown(schemaData),
    "docs/column_descriptions.md": generateColumnsMarkdown(schemaData),
    "docs/relationships.md": generateRelationshipsMarkdown(schemaData),
    "docs/joins_and_modeling.md": generateJoinsMarkdown(schemaData),
    "docs/dbt_rules.md": generateDbtMarkdown(dbtRulesData)
  };
  
  Object.entries(files).forEach(([name, content]) => zip.file(name, content));
}

function createReadmeFile(datasetName, conversionScripts = {}) {
  const hasConversionScripts = conversionScripts.sourceScript && conversionScripts.destScript;
  
  let projectStructure = `\`\`\`
├── dbt_project.yml      # DBT project configuration
├── profiles.yml         # Database connection settings
├── models/              # DBT models (SQL files)
├── seeds/               # CSV data files  
├── docs/                # Additional documentation
├── setup_dbt.sh         # Automated setup script
├── convert.py           # Dataset conversion utility`;

  if (hasConversionScripts) {
    projectStructure += `
├── convert_to_source.py # Source format conversion script
├── convert_to_destination.py # Destination format conversion script`;
  }
  
  projectStructure += `
└── README.md           # This file
\`\`\``;

  let additionalCommands = '';
  if (hasConversionScripts) {
    additionalCommands = `

## Data Conversion Scripts

This package includes additional conversion scripts generated from the Data Ingestion feature:

- \`convert_to_source.py\` - Converts uploaded file to source format
- \`convert_to_destination.py\` - Converts from source to destination format

### Running Conversion Scripts
\`\`\`bash
# Run with uv (recommended)
uv run convert_to_source.py input_file.ext
uv run convert_to_destination.py source_file.ext output_file.ext
\`\`\``;
  }

  return `# DBT Local Development Project

This project was generated by SchemaForge for local DBT development with your dataset: **${datasetName}**.

## Quick Start

1. Extract all files from this ZIP to a directory
2. Open a terminal in the extracted directory  
3. Run: \`chmod +x setup_dbt.sh && ./setup_dbt.sh\`

## Project Structure

${projectStructure}

## Commands

- \`dbt run\` - Execute all models
- \`dbt test\` - Run data quality tests
- \`dbt seed\` - Load CSV files into database
- \`dbt docs serve\` - Start documentation server${additionalCommands}

Generated by SchemaForge on ${new Date().toISOString().split('T')[0]}
`;
}

function generateSchemaMarkdown(data) {
  let md = "# Schema Overview\n\n";
  data.schemas.forEach(schema => {
    md += `## ${schema.tableName}\n\n${schema.description || 'No description available'}\n\n`;
    if (schema.primaryKey) {
      md += `**Primary Key:** ${schema.primaryKey.columns.join(', ')}\n\n`;
    }
    md += "### Columns\n\n| Name | Type | Description | Flags |\n|------|------|-------------|-------|\n";
    schema.columns?.forEach(col => {
      const flags = [];
      if (col.isPrimaryKey) flags.push("PK");
      if (col.isForeignKey) flags.push("FK");
      if (col.isPII) flags.push("PII");
      md += `| ${col.name} | ${col.dataType} | ${col.description || 'No description'} | ${flags.join(', ')} |\n`;
    });
    md += "\n\n";
  });
  return md;
}

function generateColumnsMarkdown(data) {
  let md = "# Column Descriptions\n\n";
  data.schemas.forEach(schema => {
    md += `## ${schema.tableName}\n\n`;
    schema.columns?.forEach(col => {
      md += `### ${col.name}\n\n**Type:** ${col.dataType}\n\n**Description:** ${col.description || 'No description available'}\n\n`;
      const flags = [];
      if (col.isPrimaryKey) flags.push("Primary Key");
      if (col.isForeignKey) flags.push("Foreign Key");
      if (col.isPII) flags.push("PII/Sensitive");
      if (flags.length) md += `**Flags:** ${flags.join(', ')}\n\n`;
      if (col.foreignKeyReference) {
        md += `**Foreign Key Reference:** ${col.foreignKeyReference.referencedTable}.${col.foreignKeyReference.referencedColumn}\n\n`;
      }
    });
  });
  return md;
}

function generateRelationshipsMarkdown(data) {
  let md = "# Table Relationships\n\n";
  if (!data.relationships?.length) return md + "No relationships defined.\n";
  data.relationships.forEach(rel => {
    md += `## ${rel.fromTable} → ${rel.toTable}\n\n`;
    md += `**Relationship Type:** ${rel.relationshipType}\n\n`;
    md += `**Join:** ${rel.fromTable}.${rel.fromColumn} → ${rel.toTable}.${rel.toColumn}\n\n`;
  });
  return md;
}

function generateJoinsMarkdown(data) {
  let md = "# Joins & Modeling\n\n";
  if (data.suggestedJoins?.length) {
    md += "## Suggested Join Patterns\n\n";
    data.suggestedJoins.forEach(join => {
      md += `### ${join.description}\n\n**Use Case:** ${join.useCase}\n\n**Tables:** ${join.tables.join(', ')}\n\n`;
      md += "**SQL Pattern:**\n\n```sql\n" + join.sqlPattern + "\n```\n\n";
    });
  }
  if (data.modelingRecommendations?.length) {
    md += "## Data Modeling Recommendations\n\n";
    data.modelingRecommendations.forEach(rec => md += `- ${rec}\n`);
  }
  return md;
}

function generateDbtMarkdown(data) {
  let md = "# DBT Rules\n\n";
  if (data.globalRecommendations?.length) {
    md += "## Global DBT Project Recommendations\n\n";
    data.globalRecommendations.forEach(rec => md += `- ${rec}\n`);
    md += "\n";
  }
  if (!data.dbtRules?.length) return md;
  data.dbtRules.forEach(rule => {
    md += `## ${rule.tableName}\n\n`;
    if (rule.modelSql) md += "### SQL\n\n```sql\n" + rule.modelSql + "\n```\n\n";
    if (rule.tests?.length) {
      md += "### Tests\n\n| Column | Tests |\n|-----------|-------|\n";
      rule.tests.forEach(test => {
        const testsStr = test.tests?.join(', ') || '';
        md += `| ${test.column} | ${testsStr} |\n`;
      });
      md += "\n";
    }
  });
  return md;
}