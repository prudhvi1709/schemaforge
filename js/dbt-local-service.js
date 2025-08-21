import yaml from 'https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/+esm';

const getConversionScripts = () => window.generatedConversionFiles || { sourceScript: null, destScript: null };

export function exportDbtLocalZip(schemaData, dbtRulesData, updateStatus, fileData) {
  if (!dbtRulesData) return updateStatus?.("DBT rules are required for local development. Please generate DBT rules first.", "danger");
  if (!fileData?._originalFileContent) return updateStatus?.("Original dataset file is required for local development.", "danger");

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
    const datasetName = sanitizeDatasetName(fileData.name);
    const datasetFileName = `dataset-${fileData.name}`;
    
    zip.file(datasetFileName, fileData._originalFileContent, { binary: true });
    createDbtProjectStructure(zip, datasetName, dbtRulesData, schemaData);
    
    const conversionScripts = getConversionScripts();
    const files = {
      "setup_dbt.sh": createSetupScript(datasetFileName, datasetName),
      "convert.py": createConvertPyScript(datasetFileName),
      "README.md": createReadmeFile(datasetName, conversionScripts)
    };
    
    if (conversionScripts.sourceScript) files["convert_to_source.py"] = conversionScripts.sourceScript;
    if (conversionScripts.destScript) files["convert_to_destination.py"] = conversionScripts.destScript;
    
    Object.entries(files).forEach(([name, content]) => zip.file(name, content));
    addDocumentationFiles(zip, schemaData, dbtRulesData);

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

const sanitizeDatasetName = name => 
  name.replace(/\.(csv|xlsx?)$/i, '')
      .replace(/^dataset-/, '')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^[0-9]+/, 'data_$&')
      .replace(/_{2,}/g, '_')
      .replace(/^_+|_+$/g, '');

function createDbtProjectStructure(zip, datasetName, dbtRulesData, schemaData) {
  const configs = {
    "dbt_project.yml": createProjectYml(datasetName),
    "profiles.yml": createProfilesYml(datasetName),
    "packages.yml": createPackagesYml()
  };
  Object.entries(configs).forEach(([name, content]) => zip.file(name, content));

  const modelsDir = zip.folder("models");
  if (dbtRulesData.dbtRules) {
    dbtRulesData.dbtRules.forEach(rule => {
      if (rule.modelSql) {
        const updatedSql = `-- Model for ${rule.tableName}\n${updateSqlForSeeds(rule.modelSql, datasetName)}`;
        modelsDir.file(`${rule.tableName}.sql`, updatedSql);
      }
    });
    modelsDir.file("schema.yml", createSchemaYmlFromRules(dbtRulesData, datasetName, schemaData));
  }
  zip.folder("seeds");
}

const updateSqlForSeeds = (sql, datasetName) => {
  const seedRef = `{{ ref('${datasetName}') }}`;
  const updatedSql = sql.replace(/\{\{\s*ref\(['"]\w+['"]\)\s*\}\}/gi, seedRef)
                        .replace(/FROM\s+[\w_]+(?![\w_])/gi, `FROM ${seedRef}`)
                        .replace(/(LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|JOIN)\s+[\w_]+(?![\w_])/gi, `$1 ${seedRef}`);
  return updatedSql.includes('SELECT') ? updatedSql : `SELECT * FROM ${seedRef}`;
};

const createProjectYml = datasetName => `name: '${datasetName}_analysis'
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

const createProfilesYml = datasetName => `${datasetName}_profile:
  target: dev
  outputs:
    dev:
      type: duckdb
      path: '${datasetName}.duckdb'
      threads: 1
`;

const createPackagesYml = () => `packages:
  - package: dbt-labs/dbt_utils
    version: 1.1.1
`;

function createSchemaYmlFromRules(dbtRulesData, datasetName, schemaData) {
  const schemaObj = { version: 2, models: [], seeds: [] };
  const actualColumns = new Set();
  const modelColumnTests = new Set();
  
  schemaData.schemas?.forEach(tbl => tbl.columns?.forEach(col => actualColumns.add(col.name)));

  dbtRulesData.dbtRules.forEach(rule => {
    const model = { name: rule.tableName, description: `Model: ${datasetName}`, columns: [] };
    rule.tests?.forEach(test => {
      if (!actualColumns.has(test.column)) return;
      modelColumnTests.add(test.column);
      const col = { name: test.column, tests: deduplicateTests(
        [...(test.tests || []), ...(test.relationships?.map(rel => ({ [rel.test]: { to: rel.to, field: rel.field } })) || [])]
      )};
      if (col.tests.length) model.columns.push(col);
    });
    if (model.columns.length) schemaObj.models.push(model);
  });

  const seed = { name: datasetName, description: "Source data", columns: [] };
  schemaData.schemas?.[0]?.columns?.forEach(col => {
    const seedCol = { name: col.name, description: col.description || '' };
    if (!modelColumnTests.has(col.name) && col.isPrimaryKey) seedCol.tests = ['not_null', 'unique'];
    seed.columns.push(seedCol);
  });

  schemaObj.seeds.push(seed);
  return yaml.dump(schemaObj, { noRefs: true, lineWidth: -1 });
}

const deduplicateTests = tests => {
  const seen = new Set();
  return tests.filter(t => {
    const key = typeof t === 'string' ? t : JSON.stringify(t);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const createConvertPyScript = datasetFileName => `# /// script
# requires-python = '>=3.12'
# dependencies = ['pandas', 'openpyxl']
# ///
import pandas as pd, os, re

dataset_file = '${datasetFileName}'
sanitized_name = re.sub(r'[^a-zA-Z0-9_]', '_', dataset_file.replace('dataset-', '').replace('.xlsx', '').replace('.csv', '')).strip('_')
output_csv = f'seeds/{sanitized_name}.csv'

os.makedirs('seeds', exist_ok=True)
df = pd.read_csv(dataset_file) if dataset_file.lower().endswith('.csv') else pd.read_excel(dataset_file)
df.to_csv(output_csv, index=False)
print(f'✅ Converted {dataset_file} -> {output_csv} ({df.shape[0]}x{df.shape[1]})')`;

const createSetupScript = (datasetFileName, datasetName) => `#!/bin/bash
set -e
export DBT_PROFILES_DIR=$(pwd)
export dbt='uvx --with dbt-core,dbt-duckdb dbt'

echo "🔄 Converting dataset..."
uv run convert.py

echo "🎯 Setting up DBT..."
for step in deps debug seed run test "docs generate"; do
  echo "Running dbt $step..."
  $dbt $step
done

echo "🎉 Setup complete! Run 'dbt docs serve' to view documentation"`;

const addDocumentationFiles = (zip, schemaData, dbtRulesData) => {
  const files = {
    "docs/schema_overview.md": generateSchemaMarkdown(schemaData),
    "docs/column_descriptions.md": generateColumnsMarkdown(schemaData),
    "docs/relationships.md": generateRelationshipsMarkdown(schemaData),
    "docs/joins_and_modeling.md": generateJoinsMarkdown(schemaData),
    "docs/dbt_rules.md": generateDbtMarkdown(dbtRulesData)
  };
  Object.entries(files).forEach(([name, content]) => zip.file(name, content));
};

function createReadmeFile(datasetName, conversionScripts = {}) {
  const hasScripts = conversionScripts.sourceScript && conversionScripts.destScript;
  return `# DBT Project: ${datasetName}

**Generated by SchemaForge**

## Quick Start
1. Extract ZIP contents
2. Run: \`chmod +x setup_dbt.sh && ./setup_dbt.sh\`

## Commands
- \`dbt run\` - Execute models
- \`dbt test\` - Run tests  
- \`dbt docs serve\` - View docs${hasScripts ? '\n\n## Conversion Scripts\n- \`uv run convert_to_source.py\`\n- \`uv run convert_to_destination.py\`' : ''}
`;
}

const generateSchemaMarkdown = data => {
  let md = "# Schema Overview\n\n";
  data.schemas.forEach(schema => {
    md += `## ${schema.tableName}\n${schema.description || ''}\n\n| Column | Type | Flags |\n|--------|------|-------|\n`;
    schema.columns?.forEach(col => {
      const flags = [col.isPrimaryKey && 'PK', col.isForeignKey && 'FK', col.isPII && 'PII'].filter(Boolean);
      md += `| ${col.name} | ${col.dataType} | ${flags.join(', ')} |\n`;
    });
    md += "\n";
  });
  return md;
};

const generateColumnsMarkdown = data => {
  let md = "# Column Details\n\n";
  data.schemas.forEach(schema => {
    md += `## ${schema.tableName}\n\n`;
    schema.columns?.forEach(col => {
      md += `**${col.name}** (${col.dataType}): ${col.description || 'No description'}\n`;
    });
  });
  return md;
};

const generateRelationshipsMarkdown = data => {
  let md = "# Relationships\n\n";
  if (!data.relationships?.length) return md + "None defined.\n";
  data.relationships.forEach(rel => md += `- ${rel.fromTable}.${rel.fromColumn} → ${rel.toTable}.${rel.toColumn}\n`);
  return md;
};

const generateJoinsMarkdown = data => {
  let md = "# Joins & Modeling\n\n";
  if (data.suggestedJoins?.length) {
    md += "## Join Patterns\n";
    data.suggestedJoins.forEach(join => md += `- ${join.description}\n`);
  }
  if (data.modelingRecommendations?.length) {
    md += "\n## Recommendations\n";
    data.modelingRecommendations.forEach(rec => md += `- ${rec}\n`);
  }
  return md;
};

const generateDbtMarkdown = data => {
  let md = "# DBT Rules\n\n";
  if (data.globalRecommendations?.length) {
    md += "## Global Recommendations\n";
    data.globalRecommendations.forEach(rec => md += `- ${rec}\n`);
  }
  if (data.dbtRules?.length) {
    md += "\n## Models\n";
    data.dbtRules.forEach(rule => {
      md += `### ${rule.tableName}\n`;
      if (rule.modelSql) md += "```sql\n" + rule.modelSql + "\n```\n";
    });
  }
  return md;
};