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
  // Load JSZip library dynamically if needed
  if (typeof JSZip === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.onload = () => createZip(schemaData, dbtRulesData, updateStatus, fileData);
    document.head.appendChild(script);
  } else {
    createZip(schemaData, dbtRulesData, updateStatus, fileData);
  }
}

/**
 * Create and download ZIP with schema data
 * @param {Object} schemaData - Schema information
 * @param {Object} dbtRulesData - DBT rules (optional)
 * @param {Function} updateStatus - Function to update UI status
 * @param {Object} fileData - The uploaded dataset file (optional)
 */
function createZip(schemaData, dbtRulesData, updateStatus, fileData) {
  const zip = new JSZip();
  const notify = msg => updateStatus && updateStatus(msg.text, msg.type);
  
  // Add the original uploaded dataset file if available
  if (fileData && fileData._originalFileContent) {
    notify({text: "Adding original dataset file to export", type: "info"});
    try {
      // Store with original filename in a datasets/ folder for organization
      zip.file(`dataset-${fileData.name}`, fileData._originalFileContent, { binary: true });
    } catch (error) {
      console.error("Error adding dataset file to zip:", error);
      notify({text: "Could not include original dataset file in export", type: "warning"});
    }
  }
  
  // Add markdown files to zip
  const files = {
    "schema_overview.md": generateSchemaMarkdown(schemaData),
    "column_descriptions.md": generateColumnsMarkdown(schemaData),
    "relationships.md": generateRelationshipsMarkdown(schemaData),
    "joins_and_modeling.md": generateJoinsMarkdown(schemaData)
  };
  
  if (dbtRulesData) files["dbt_rules.md"] = generateDbtMarkdown(dbtRulesData);
  Object.entries(files).forEach(([name, content]) => zip.file(name, content));
  
  // Add diagram image if available
  try {
    if (window.myDiagram) {
      const imgData = window.myDiagram.makeImageData({background: "white", scale: 1, type: "image/jpeg"});
      zip.file("er_diagram.jpeg", imgData.split(',')[1], {base64: true});
    }
  } catch (error) {
    console.error("Error creating diagram image:", error);
    notify({text: "Error creating diagram image", type: "warning"});
  }
  
  // Download the zip file
  zip.generateAsync({type: "blob"})
    .then(content => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(content);
      a.download = `schemaforge_export_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      }, 0);
      notify({text: "Export completed successfully", type: "success"});
    })
    .catch(error => {
      console.error("Error generating zip:", error);
      notify({text: "Error generating zip file", type: "danger"});
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
      // Basic info
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