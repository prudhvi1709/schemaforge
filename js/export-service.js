/**
 * Export service for SchemaForge - Handles exporting schema data to ZIP format
 */

/**
 * Export schema data to a ZIP file
 * @param {Object} schemaData - Schema information
 * @param {Object} dbtRulesData - DBT rules (optional)
 * @param {Function} updateStatus - Function to update UI status
 * @param {Object} fileData - The uploaded dataset file (optional)
 */
export function exportToZip(schemaData, dbtRulesData, updateStatus, fileData) {
  loadJSZipAndExecute(async () => await createZip(schemaData, dbtRulesData, updateStatus, fileData, false));
}

/**
 * Export for DBT Local Run - includes shell script and all required files
 * @param {Object} schemaData - Schema information
 * @param {Object} dbtRulesData - DBT rules (required)
 * @param {Function} updateStatus - Function to update UI status
 * @param {Object} fileData - The uploaded dataset file (required)
 */
export function exportForDbtLocalRun(schemaData, dbtRulesData, updateStatus, fileData) {
  if (!dbtRulesData) {
    updateStatus && updateStatus("DBT rules are required for local run export", "danger");
    return;
  }
  
  if (!fileData || !fileData._originalFileContent) {
    updateStatus && updateStatus("Original dataset file is required for local run export", "danger");
    return;
  }
  
  loadJSZipAndExecute(async () => await createZip(schemaData, dbtRulesData, updateStatus, fileData, true));
}

/**
 * Load JSZip library dynamically if needed
 * @param {Function} callback - Function to call after JSZip is loaded
 */
function loadJSZipAndExecute(callback) {
  if (typeof JSZip === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.onload = callback;
    document.head.appendChild(script);
  } else {
    callback();
  }
}

/**
 * Create and download ZIP with schema data
 * @param {Object} schemaData - Schema information
 * @param {Object} dbtRulesData - DBT rules (optional)
 * @param {Function} updateStatus - Function to update UI status
 * @param {Object} fileData - The uploaded dataset file (optional)
 * @param {boolean} isDbtLocalRun - Whether this is for DBT local run export
 */
async function createZip(schemaData, dbtRulesData, updateStatus, fileData, isDbtLocalRun = false) {
  const zip = new JSZip();
  const notify = msg => updateStatus && updateStatus(msg.text, msg.type);
  
  notify({text: isDbtLocalRun ? "Creating DBT local run package..." : "Creating export package...", type: "info"});
  
  // Add dataset file if available
  addDatasetFile(zip, fileData, notify);
  
  // Add markdown files
  addMarkdownFiles(zip, schemaData, dbtRulesData, notify, isDbtLocalRun);
  
  // Add diagram if available
  addDiagramImage(zip, notify);
  
  // Add DBT-specific files for local run
  if (isDbtLocalRun) {
    await addDbtLocalRunFiles(zip, notify);
  }
  
  // Download the zip
  downloadZip(zip, notify, isDbtLocalRun);
}

/**
 * Add dataset file to ZIP
 */
function addDatasetFile(zip, fileData, notify) {
  if (fileData && fileData._originalFileContent) {
    notify({text: "Adding dataset file", type: "info"});
    try {
      // Ensure filename has dataset- prefix for compatibility with run_dbt.sh
      const fileName = fileData.name.startsWith('dataset-') 
        ? fileData.name 
        : `dataset-${fileData.name}`;
      
      // Always store as binary to preserve original file format (Excel, CSV, etc.)
      zip.file(fileName, fileData._originalFileContent, { binary: true });
    } catch (error) {
      console.error("Error adding dataset file to zip:", error);
      notify({text: "Could not include dataset file in export", type: "warning"});
    }
  }
}

/**
 * Add markdown files to ZIP
 */
function addMarkdownFiles(zip, schemaData, dbtRulesData, notify, isDbtLocalRun) {
  const files = {
    "schema_overview.md": generateSchemaMarkdown(schemaData),
    "column_descriptions.md": generateColumnsMarkdown(schemaData),
    "relationships.md": generateRelationshipsMarkdown(schemaData),
    "joins_and_modeling.md": generateJoinsMarkdown(schemaData)
  };
  
  // Always include DBT rules for local run, optional for regular export
  if (isDbtLocalRun || dbtRulesData) {
    files["dbt_rules.md"] = generateDbtMarkdown(dbtRulesData);
  }
  
  Object.entries(files).forEach(([name, content]) => zip.file(name, content));
  notify({text: "Added documentation files", type: "info"});
}

/**
 * Add diagram image to ZIP
 */
function addDiagramImage(zip, notify) {
  try {
    if (window.myDiagram) {
      const imgData = window.myDiagram.makeImageData({background: "white", scale: 1, type: "image/webp"});
      zip.file("er_diagram.webp", imgData.split(',')[1], {base64: true});
      notify({text: "Added ER diagram", type: "info"});
    }
  } catch (error) {
    console.error("Error creating diagram image:", error);
    notify({text: "Could not create diagram image", type: "warning"});
  }
}

/**
 * Add DBT local run specific files
 */
async function addDbtLocalRunFiles(zip, notify) {
  // Add shell script
  const shellScript = await getRunDbtShellScript();
  zip.file("run_dbt.sh", shellScript);
  notify({text: "Added run_dbt.sh shell script", type: "info"});
  
  // Add README
  zip.file("README.md", generateDbtRunReadme());
  notify({text: "Added README with instructions", type: "info"});
}

/**
 * Download the ZIP file
 */
function downloadZip(zip, notify, isDbtLocalRun) {
  const filename = isDbtLocalRun 
    ? `schemaforge_dbt_local_${new Date().toISOString().slice(0, 10)}.zip`
    : `schemaforge_export_${new Date().toISOString().slice(0, 10)}.zip`;
    
  const successMessage = isDbtLocalRun 
    ? "DBT local run package ready! Extract and run ./run_dbt.sh"
    : "Export completed successfully";

  zip.generateAsync({type: "blob"})
    .then(content => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(content);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      }, 0);
      notify({text: successMessage, type: "success"});
    })
    .catch(error => {
      console.error("Error generating zip:", error);
      notify({text: `Error generating ${isDbtLocalRun ? 'DBT local run package' : 'zip file'}`, type: "danger"});
    });
}

// Generate markdown for different content types
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
      
      // Flags
      const flags = [];
      if (col.isPrimaryKey) flags.push("Primary Key");
      if (col.isForeignKey) flags.push("Foreign Key");
      if (col.isPII) flags.push("PII/Sensitive");
      if (flags.length) md += `**Flags:** ${flags.join(', ')}\n\n`;
      
      // Foreign key reference
      if (col.foreignKeyReference) {
        md += `**Foreign Key Reference:** ${col.foreignKeyReference.referencedTable}.${col.foreignKeyReference.referencedColumn} (${col.foreignKeyReference.confidence} confidence)\n\n`;
      }
      
      // Lists (observations and constraints)
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
  
  // Add suggested joins
  if (data.suggestedJoins?.length) {
    md += "## Suggested Join Patterns\n\n";
    data.suggestedJoins.forEach(join => {
      md += `### ${join.description}\n\n`;
      md += `**Use Case:** ${join.useCase}\n\n`;
      md += `**Tables:** ${join.tables.join(', ')}\n\n`;
      md += "**SQL Pattern:**\n\n```sql\n" + join.sqlPattern + "\n```\n\n";
    });
  }
  
  // Add modeling recommendations
  if (data.modelingRecommendations?.length) {
    md += "## Data Modeling Recommendations\n\n";
    data.modelingRecommendations.forEach(rec => md += `- ${rec}\n`);
  }
  return md;
}

function generateDbtMarkdown(data) {
  if (!data) return "# DBT Rules\n\nNo DBT rules generated.\n";
  
  let md = "# DBT Rules\n\n";
  
  // Global recommendations
  if (data.globalRecommendations?.length) {
    md += "## Global DBT Project Recommendations\n\n";
    data.globalRecommendations.forEach(rec => md += `- ${rec}\n`);
    md += "\n";
  }
  
  // Rules for each table
  if (!data.dbtRules?.length) return md;
  
  data.dbtRules.forEach(rule => {
    md += `## ${rule.tableName} ${rule.materialization ? `(${rule.materialization})` : ''}\n\n`;
    
    // SQL and YAML
    if (rule.modelSql) md += "### SQL\n\n```sql\n" + rule.modelSql + "\n```\n\n";
    if (rule.yamlConfig) md += "### YAML Configuration\n\n```yaml\n" + rule.yamlConfig + "\n```\n\n";
    
    // Tests
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
    
    // Recommendations
    if (rule.recommendations?.length) {
      md += "### Model-Specific Recommendations\n\n";
      rule.recommendations.forEach(rec => md += `- ${rec}\n`);
      md += "\n";
    }
    
    // Relationships
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

/**
 * Get the shell script content for DBT local run
 */
async function getRunDbtShellScript() {
  try {
    const response = await fetch('run_dbt.sh');
    if (response.ok) {
      return await response.text();
    } else {
      console.warn('Could not load run_dbt.sh, using fallback');
      return getFallbackShellScript();
    }
  } catch (error) {
    console.warn('Error loading run_dbt.sh:', error);
    return getFallbackShellScript();
  }
}

/**
 * Fallback shell script content if run_dbt.sh cannot be loaded
 */
function getFallbackShellScript() {
  return `#!/bin/bash
# Fallback DBT run script
echo "⚠️  Using fallback script - please ensure run_dbt.sh is available"
echo "Please place the run_dbt.sh file in your project root and try again"
exit 1`;
}

/**
 * Generate README for DBT local run package
 */
function generateDbtRunReadme() {
  return `# SchemaForge DBT Local Run Package

This package contains everything you need to run DBT locally with your SchemaForge-generated rules.

## Contents

- \`dataset-*\` - Your original dataset file
- \`dbt_rules.md\` - Generated DBT rules with SQL and YAML configurations
- \`run_dbt.sh\` - Automated setup and run script
- \`*.md\` - Schema documentation files
- \`er_diagram.webp\` - Entity relationship diagram

## Prerequisites

Before running, ensure you have:

1. **Python 3** with required packages:
   \`\`\`bash
   pip install pandas openpyxl chardet
   \`\`\`

2. **DBT with DuckDB adapter**:
   \`\`\`bash
   pip install dbt-core dbt-duckdb
   \`\`\`

## Quick Start

1. **Extract this ZIP file** to a directory
2. **Open terminal** in the extracted directory
3. **Run the automation script**:
   \`\`\`bash
   chmod +x run_dbt.sh
   ./run_dbt.sh
   \`\`\`

## What the Script Does

The \`run_dbt.sh\` script will automatically:

1. ✅ Find your dataset file
2. 🔄 Convert Excel to CSV (if needed)
3. 📂 Create a proper DBT project structure
4. 🔍 Extract SQL models and YAML configs from \`dbt_rules.md\`
5. ⚙️ Set up \`dbt_project.yml\` and \`profiles.yml\`
6. 🏗️ Run DBT seed, run, and test commands
7. 📊 Generate data quality test results

## Results

After running, you'll have:

- **\`my_dbt_project/\`** - Complete DBT project
- **\`my_dbt_project/my_local.duckdb\`** - Database with your data and models
- **\`my_dbt_project/target/run_results.json\`** - Detailed test results
- Data quality issues identified through DBT tests

## Troubleshooting

- If conversion fails, ensure pandas and openpyxl are installed
- If DBT commands fail, check that dbt-core and dbt-duckdb are installed
- Tests may fail intentionally to highlight data quality issues

## Next Steps

- Explore the database file with any SQL client that supports DuckDB
- Review test results in \`target/run_results.json\`
- Customize the DBT models in \`my_dbt_project/models/\`
- Run \`dbt docs generate && dbt docs serve\` for interactive documentation

Generated by SchemaForge 🔥`;
}