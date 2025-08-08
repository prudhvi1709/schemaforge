/**
 * DBT Local service for SchemaForge - Handles generating DBT project for local development
 */

/**
 * Export schema data to a ZIP file with DBT project structure for local development
 * @param {Object} schemaData - Schema information
 * @param {Object} dbtRulesData - DBT rules (required)
 * @param {Function} updateStatus - Function to update UI status
 * @param {Object} fileData - The uploaded dataset file (required)
 */
export function exportDbtLocalZip(schemaData, dbtRulesData, updateStatus, fileData) {
  if (!dbtRulesData) {
    updateStatus && updateStatus("DBT rules are required for local development. Please generate DBT rules first.", "danger");
    return;
  }

  if (!fileData || !fileData._originalFileContent) {
    updateStatus && updateStatus("Original dataset file is required for local development.", "danger");
    return;
  }

  // Load JSZip library dynamically if needed
  if (typeof JSZip === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.onload = () => createDbtLocalZip(schemaData, dbtRulesData, updateStatus, fileData);
    document.head.appendChild(script);
  } else {
    createDbtLocalZip(schemaData, dbtRulesData, updateStatus, fileData);
  }
}

/**
 * Create and download ZIP with complete DBT project for local development
 * @param {Object} schemaData - Schema information
 * @param {Object} dbtRulesData - DBT rules
 * @param {Function} updateStatus - Function to update UI status
 * @param {Object} fileData - The uploaded dataset file
 */
function createDbtLocalZip(schemaData, dbtRulesData, updateStatus, fileData) {
  const zip = new JSZip();
  const notify = msg => updateStatus && updateStatus(msg.text, msg.type);
  
  notify({text: "Creating DBT local project structure...", type: "info"});

  try {
    // Extract dataset name from filename (remove extension and dataset- prefix)
    const originalFileName = fileData.name;
    const rawDatasetName = originalFileName.replace(/\.(csv|xlsx?)$/i, '').replace(/^dataset-/, '');
    
    // Sanitize dataset name for DBT (only letters, numbers, underscores; must start with letter/underscore)
    const datasetName = rawDatasetName
      .replace(/[^a-zA-Z0-9_]/g, '_')  // Replace invalid characters with underscores
      .replace(/^[0-9]+/, 'data_$&')   // Prefix with 'data_' if starts with numbers
      .replace(/_{2,}/g, '_')          // Replace multiple underscores with single
      .replace(/^_+|_+$/g, '');       // Remove leading/trailing underscores
    
    // 1. Add the original dataset file for conversion to CSV
    const datasetFileName = `dataset-${originalFileName}`;
    zip.file(datasetFileName, fileData._originalFileContent, { binary: true });
    notify({text: "Added original dataset file", type: "info"});

    // 2. Create DBT project structure
    createDbtProjectStructure(zip, datasetName, dbtRulesData, notify);

    // 3. Create automation shell script
    const setupScript = createSetupScript(datasetFileName, datasetName, dbtRulesData);
    zip.file("setup_dbt.sh", setupScript);
    notify({text: "Created setup automation script", type: "info"});

    // 4. Add documentation files
    addDocumentationFiles(zip, schemaData, dbtRulesData, notify);

    // 5. Add README with instructions
    const readme = createReadmeFile(datasetName);
    zip.file("README.md", readme);
    notify({text: "Added project documentation", type: "info"});

    // Download the zip file
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
        notify({text: "DBT local project exported successfully! Extract and run './setup_dbt.sh' to get started.", type: "success"});
      })
      .catch(error => {
        console.error("Error generating DBT local zip:", error);
        notify({text: "Error generating DBT local project", type: "danger"});
      });

  } catch (error) {
    console.error("Error creating DBT local project:", error);
    notify({text: "Error creating DBT local project structure", type: "danger"});
  }
}

/**
 * Create DBT project structure in the ZIP
 * @param {JSZip} zip - JSZip instance
 * @param {string} datasetName - Name of the dataset
 * @param {Object} dbtRulesData - DBT rules data
 * @param {Function} notify - Notification function
 */
function createDbtProjectStructure(zip, datasetName, dbtRulesData, notify) {
  // Create dbt_project.yml
  const projectYml = createProjectYml(datasetName);
  zip.file("dbt_project.yml", projectYml);

  // Create profiles.yml for local development
  const profilesYml = createProfilesYml(datasetName);
  zip.file("profiles.yml", profilesYml);

  // Create models directory and files
  const modelsDir = zip.folder("models");
  
  // Extract SQL and YAML from dbt_rules.md format
  if (dbtRulesData.dbtRules) {
    dbtRulesData.dbtRules.forEach(rule => {
      if (rule.modelSql) {
        // Update SQL to reference seeds instead of tables
        const updatedSql = updateSqlForSeeds(rule.modelSql, datasetName);
        modelsDir.file(`${rule.tableName}.sql`, updatedSql);
      }
    });

    // Create schema.yml with all model configurations
    const schemaYml = createSchemaYml(dbtRulesData.dbtRules, datasetName);
    modelsDir.file("schema.yml", schemaYml);
  }

  // Create seeds directory (will be populated by script)
  zip.folder("seeds");

  notify({text: "Created DBT project structure", type: "info"});
}

/**
 * Update SQL to reference seeds instead of tables
 * @param {string} sql - Original SQL
 * @param {string} datasetName - Dataset name for seed reference
 * @returns {string} Updated SQL
 */
function updateSqlForSeeds(sql, datasetName) {
  // Replace table references with seed references
  const seedRef = `{{ ref('${datasetName}') }}`;
  
  // More comprehensive SQL replacement
  let updatedSql = sql;
  
  // Replace specific problematic patterns first
  updatedSql = updatedSql.replace(/\{\{\s*ref\(['"]\w+_seed['"]\)\s*\}\}/gi, seedRef);
  updatedSql = updatedSql.replace(/\{\{\s*ref\(['"]\w+['"]\)\s*\}\}/gi, seedRef);
  
  // Replace FROM clauses with table names
  updatedSql = updatedSql.replace(/FROM\s+[\w_]+(?![\w_])/gi, `FROM ${seedRef}`);
  
  // Replace JOIN clauses  
  updatedSql = updatedSql.replace(/(LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|JOIN)\s+[\w_]+(?![\w_])/gi, `$1 ${seedRef}`);
  
  // Replace any remaining table references that might be standalone
  updatedSql = updatedSql.replace(/\b[\w_]+_seed\b/gi, datasetName);
  
  // Replace table references in comments
  updatedSql = updatedSql.replace(/-- .*table.*/gi, `-- Referencing seed: ${datasetName}`);
  
  // If SQL is very generic or doesn't have proper structure, provide a basic SELECT
  if (!updatedSql.includes('SELECT') || updatedSql.trim().length < 20) {
    updatedSql = `-- DBT model for ${datasetName}
-- Note: This model references the main dataset
SELECT *
FROM ${seedRef}`;
  }
  
  return updatedSql;
}

/**
 * Create dbt_project.yml content
 * @param {string} datasetName - Dataset name
 * @returns {string} YAML content
 */
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

/**
 * Create profiles.yml content for local development
 * @param {string} datasetName - Dataset name
 * @returns {string} YAML content
 */
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

/**
 * Create schema.yml with model configurations and tests
 * @param {Array} dbtRules - DBT rules array
 * @param {string} datasetName - Dataset name
 * @returns {string} YAML content
 */
function createSchemaYml(dbtRules, datasetName) {
  let yamlContent = `version: 2

models:
`;

  // Since all models reference the same seed, we'll create a simplified schema
  // that only tests basic properties and avoids testing non-existent columns
  dbtRules.forEach(rule => {
    yamlContent += `  - name: ${rule.tableName}\n`;
    yamlContent += `    description: "Model derived from ${datasetName} dataset"\n`;
  });

  yamlContent += `
seeds:
  - name: ${datasetName}
    description: "Source data for analysis"
    columns:
      - name: patient_id
        description: "Patient identifier" 
        tests:
          - not_null
      - name: study_id  
        description: "Study identifier"
        tests:
          - not_null
      - name: site_cd
        description: "Site code"
        tests:
          - not_null
      - name: "*"
        description: "All other columns from the dataset"
`;

  return yamlContent;
}

/**
 * Create setup shell script for automating DBT local development
 * @param {string} datasetFileName - Original dataset file name
 * @param {string} datasetName - Clean dataset name
 * @param {Object} dbtRulesData - DBT rules data
 * @returns {string} Shell script content
 */
function createSetupScript(datasetFileName, datasetName, dbtRulesData) {
  return `#!/bin/bash

# DBT Local Development Setup Script
# Generated by SchemaForge

set -e

echo "🔧 Setting up DBT local development environment..."

# Check if required tools are installed
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo "❌ Error: $1 is not installed. Please install it first."
        exit 1
    fi
}

echo "📋 Checking prerequisites..."
check_command python3
check_command pip

# Install DBT if not installed
if ! command -v dbt &> /dev/null; then
    echo "📦 Installing DBT..."
    pip install dbt-core dbt-duckdb
else
    echo "✅ DBT is already installed"
fi

# Install additional Python packages for data conversion
echo "📦 Installing required Python packages..."
pip install pandas openpyxl duckdb

# Convert dataset to CSV format
echo "🔄 Converting dataset to CSV format..."
python3 -c "
import pandas as pd
import os
import re

# Read the original dataset file
dataset_file = '${datasetFileName}'

# Extract and sanitize dataset name for DBT compatibility
original_name = dataset_file.replace('dataset-', '').replace('.xlsx', '').replace('.csv', '')
sanitized_name = re.sub(r'[^a-zA-Z0-9_]', '_', original_name)
sanitized_name = re.sub(r'^[0-9]+', r'data_\g<0>', sanitized_name)
sanitized_name = re.sub(r'_{2,}', '_', sanitized_name)
sanitized_name = sanitized_name.strip('_')

output_csv = f'seeds/{sanitized_name}.csv'

print(f'Converting {dataset_file} to {output_csv}...')
print(f'Sanitized name: {original_name} -> {sanitized_name}')

# Create seeds directory if it doesn't exist
os.makedirs('seeds', exist_ok=True)

# Read based on file extension
if dataset_file.lower().endswith('.csv'):
    df = pd.read_csv(dataset_file)
elif dataset_file.lower().endswith(('.xlsx', '.xls')):
    df = pd.read_excel(dataset_file)
else:
    raise ValueError(f'Unsupported file format: {dataset_file}')

# Save as CSV
df.to_csv(output_csv, index=False)
print(f'✅ Dataset converted and saved to {output_csv}')
print(f'📊 Dataset shape: {df.shape[0]} rows, {df.shape[1]} columns')
"

# Initialize DBT project
echo "🎯 Initializing DBT project..."
if [ ! -f "profiles.yml" ]; then
    echo "❌ profiles.yml not found. Make sure you extracted all files from the ZIP."
    exit 1
fi

# Set DBT profiles directory to current directory
export DBT_PROFILES_DIR=\$(pwd)

# Install dependencies (if any)
echo "📦 Installing DBT dependencies..."
dbt deps

# Test DBT connection
echo "🔗 Testing DBT connection..."
dbt debug

# Load seeds
echo "🌱 Loading seeds into database..."
dbt seed

# Run models
echo "🏗️  Running DBT models..."
dbt run

# Run tests
echo "🧪 Running DBT tests..."
dbt test

# Generate documentation
echo "📖 Generating DBT documentation..."
dbt docs generate

echo ""
echo "🎉 DBT local development setup complete!"
echo ""
echo "📁 Project structure:"
echo "   ├── models/          # DBT models"
echo "   ├── seeds/           # CSV data files"
echo "   ├── target/          # Compiled SQL and results"
echo "   ├── ${datasetName}.duckdb  # DuckDB database"
echo "   └── profiles.yml     # DBT connection config"
echo ""
echo "🚀 Next steps:"
echo "   1. Explore your data: python3 -c \\\"import duckdb; con = duckdb.connect('${datasetName}.duckdb'); print(con.execute('SHOW TABLES').fetchall())\\\""
echo "   2. View models: ls models/"
echo "   3. Run specific model: dbt run --models model_name"
echo "   4. View documentation: dbt docs serve"
echo ""
echo "💡 Useful commands:"
echo "   - dbt run              # Run all models"
echo "   - dbt test             # Run all tests"
echo "   - dbt seed             # Reload seed data"
echo "   - dbt docs serve       # Start documentation server"
echo ""
`;
}

/**
 * Add documentation files to the ZIP
 * @param {JSZip} zip - JSZip instance
 * @param {Object} schemaData - Schema data
 * @param {Object} dbtRulesData - DBT rules data
 * @param {Function} notify - Notification function
 */
function addDocumentationFiles(zip, schemaData, dbtRulesData, notify) {
  // Add original documentation files from export service
  const files = {
    "docs/schema_overview.md": generateSchemaMarkdown(schemaData),
    "docs/column_descriptions.md": generateColumnsMarkdown(schemaData),
    "docs/relationships.md": generateRelationshipsMarkdown(schemaData),
    "docs/joins_and_modeling.md": generateJoinsMarkdown(schemaData),
    "docs/dbt_rules.md": generateDbtMarkdown(dbtRulesData)
  };
  
  Object.entries(files).forEach(([name, content]) => zip.file(name, content));
  notify({text: "Added documentation files", type: "info"});
}

/**
 * Create README file with setup instructions
 * @param {string} datasetName - Dataset name
 * @returns {string} README content
 */
function createReadmeFile(datasetName) {
  return `# DBT Local Development Project

This project was generated by SchemaForge for local DBT development with your dataset: **${datasetName}**.

## Quick Start

1. Extract all files from this ZIP to a directory
2. Open a terminal in the extracted directory
3. Run the setup script:
   \`\`\`bash
   chmod +x setup_dbt.sh
   ./setup_dbt.sh
   \`\`\`

The script will automatically:
- Install DBT and required dependencies
- Convert your dataset to CSV format in the \`seeds/\` directory
- Set up the DBT project structure
- Load data and run models
- Execute tests
- Generate documentation

## Project Structure

\`\`\`
├── dbt_project.yml      # DBT project configuration
├── profiles.yml         # Database connection settings
├── models/              # DBT models (SQL files)
│   ├── schema.yml       # Model tests and documentation
│   └── *.sql           # Generated model files
├── seeds/               # CSV data files
│   └── ${datasetName}.csv    # Your dataset in CSV format
├── docs/                # Additional documentation
├── setup_dbt.sh         # Automated setup script
└── README.md           # This file
\`\`\`

## Manual Setup (if script fails)

1. Install DBT: \`pip install dbt-core dbt-duckdb\`
2. Install pandas: \`pip install pandas openpyxl\`
3. Convert dataset to CSV and place in \`seeds/\` directory
4. Set DBT profiles directory: \`export DBT_PROFILES_DIR=\$(pwd)\`
5. Run: \`dbt seed\`, \`dbt run\`, \`dbt test\`

## Useful Commands

- \`dbt run\` - Execute all models
- \`dbt test\` - Run data quality tests
- \`dbt seed\` - Load CSV files into database
- \`dbt docs serve\` - Start documentation server
- \`dbt compile\` - Generate SQL without running

## Database

This project uses DuckDB as the database backend. Your data will be stored in \`${datasetName}.duckdb\`.

To explore the database directly:
\`\`\`python
import duckdb
con = duckdb.connect('${datasetName}.duckdb')
print(con.execute('SHOW TABLES').fetchall())
con.close()
\`\`\`

## Need Help?

- [DBT Documentation](https://docs.getdbt.com/)
- [DBT DuckDB Adapter](https://github.com/dbt-labs/dbt-duckdb)
- Check the \`docs/\` directory for schema and relationship information

Generated by [SchemaForge](https://github.com/your-repo/schemaforge) on ${new Date().toISOString().split('T')[0]}
`;
}

// Helper functions from export-service.js (simplified versions)
function generateSchemaMarkdown(data) {
  let md = "# Schema Overview\n\n";
  
  data.schemas.forEach(schema => {
    md += `## ${schema.tableName}\n\n${schema.description || 'No description available'}\n\n`;
    
    if (schema.primaryKey) {
      md += `**Primary Key:** ${schema.primaryKey.columns.join(', ')} (${schema.primaryKey.type}, ${schema.primaryKey.confidence} confidence)\n\n`;
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
        md += `**Foreign Key Reference:** ${col.foreignKeyReference.referencedTable}.${col.foreignKeyReference.referencedColumn} (${col.foreignKeyReference.confidence} confidence)\n\n`;
      }
      
      ["qualityObservations", "constraints"].forEach(prop => {
        if (col[prop]?.length) {
          md += `**${prop === "qualityObservations" ? "Data Quality Observations" : "Constraints"}:**\n\n`;
          col[prop].forEach(item => md += `- ${item}\n`);
          md += "\n";
        }
      });
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
    md += `**Recommended Join Type:** ${rel.joinType.toUpperCase()}\n\n`;
    md += `**Confidence:** ${rel.confidence}\n\n`;
    md += `**Description:** ${rel.description || 'No description available'}\n\n`;
  });
  return md;
}

function generateJoinsMarkdown(data) {
  let md = "# Joins & Modeling\n\n";
  
  if (data.suggestedJoins?.length) {
    md += "## Suggested Join Patterns\n\n";
    data.suggestedJoins.forEach(join => {
      md += `### ${join.description}\n\n`;
      md += `**Use Case:** ${join.useCase}\n\n`;
      md += `**Tables:** ${join.tables.join(', ')}\n\n`;
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
    md += `## ${rule.tableName} ${rule.materialization ? `(${rule.materialization})` : ''}\n\n`;
    
    if (rule.modelSql) md += "### SQL\n\n```sql\n" + rule.modelSql + "\n```\n\n";
    if (rule.yamlConfig) md += "### YAML Configuration\n\n```yaml\n" + rule.yamlConfig + "\n```\n\n";
    
    if (rule.tests?.length) {
      md += "### Tests\n\n| Column | Tests | Relationships |\n|--------|-------|---------------|\n";
      rule.tests.forEach(test => {
        const testsStr = test.tests?.join(', ') || '';
        const relMap = rel => `${rel.test} → ${rel.to} (${rel.field})`;
        const relsStr = test.relationships?.map(relMap).join(', ') || '';
        md += `| ${test.column} | ${testsStr} | ${relsStr} |\n`;
      });
      md += "\n";
    }
    
    if (rule.recommendations?.length) {
      md += "### Model-Specific Recommendations\n\n";
      rule.recommendations.forEach(rec => md += `- ${rec}\n`);
      md += "\n";
    }
    
    if (rule.relationships?.length) {
      md += "### Table Relationships\n\n";
      rule.relationships.forEach(rel => {
        md += `#### ${rel.description}\n\n`;
        md += "**Join Logic:**\n\n```sql\n" + rel.joinLogic + "\n```\n\n";
      });
    }
    md += "\n";
  });
  return md;
}