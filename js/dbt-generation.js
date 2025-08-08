// Import libraries
import { parse } from "https://cdn.jsdelivr.net/npm/partial-json@0.1.7/+esm";
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@2";

/**
 * Generate DBT rules from schema using LLM with streaming
 * @param {Object} schemaData - Generated schema information
 * @param {Object} llmConfig - LLM provider configuration
 * @param {Function} onUpdate - Callback function for streaming updates
 * @returns {Object} Generated DBT rules with summary
 */
export async function generateDbtRules(schemaData, llmConfig, onUpdate) {
  try {
    const prompt = createDbtRulesPrompt(schemaData);
    
    const body = {
      model: "gpt-4.1-mini",
      stream: true,
      messages: [
        {
          role: "system",
          content: "You are a DBT expert that generates high-quality DBT rules and tests based on schema information."
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    };

    let fullContent = "";
    let parsedContent = null;
    
    for await (const { content, error } of asyncLLM(`${llmConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${llmConfig.apiKey}`
      },
      body: JSON.stringify(body),
    })) {
      if (error) throw new Error(`LLM API error: ${error}`);
      
      if (content) {
        fullContent = content;
        
        try {
          // Try to parse the partial JSON
          parsedContent = parse(fullContent);
          
          // Call the update callback with the latest parsed content
          if (onUpdate && typeof onUpdate === 'function') {
            onUpdate(parsedContent);
          }
        } catch (parseError) {
          // Ignore parse errors for partial content - we'll try again with the next chunk
        }
      }
    }
    
    // Final parse of the complete content
    const result = JSON.parse(fullContent);
    
    // Add a default summary if one isn't provided
    if (!result.summary && result.globalRecommendations) {
      result.summary = result.globalRecommendations.join("\n\n");
    }
    
    return result;
  } catch (error) {
    throw new Error(`DBT rules generation failed: ${error.message}`);
  }
}

/**
 * Handle chat response for DBT rule modifications
 * @param {Object} context - Data context including current rules
 * @param {String} userMessage - User's message
 * @param {Object} llmConfig - LLM provider configuration
 * @param {Function} onUpdate - Update callback for streaming
 * @returns {Object} - Contains finalResponse and any updated rules
 */
export async function handleDbtRuleChat(context, userMessage, llmConfig, onUpdate) {
  try {
    // System prompt that instructs the LLM how to handle rule modifications
    const messages = [
      {
        role: "system",
        content: `You are a helpful assistant specializing in data analysis, schema design, and DBT rules. You can answer questions and also modify DBT rules when requested.

When the user asks about adding, modifying, or updating DBT rules, respond with a special format that starts with "DBT_RULE_JSON:" followed by a valid JSON object that contains the changes.

For NEW rules:
- Set "isNewRule": true to explicitly mark it as a new rule
- If creating a completely new table, choose a descriptive tableName that doesn't exist yet
- If adding an additional rule for an existing table, add _additional or _new suffix to the tableName
- Provide a complete rule object with all required fields

For modifying existing rules:
- Provide only the fields that need to be updated
- Use the exact same tableName as the existing rule
- Do NOT set "isNewRule": true

DBT rule JSON format for new rules:
DBT_RULE_JSON: {"dbtRules": [{"isNewRule": true, "tableName": "example_table", "modelSql": "SELECT * FROM {{ ref('table_name') }}", ...}]}

For normal questions, respond in a conversational way. Only use the special format when explicit rule changes are requested.

Here's information about the data context: ${JSON.stringify(context)}.`
      },
      { role: "user", content: userMessage }
    ];
    
    const body = {
      model: "gpt-4.1-mini",
      stream: true,
      messages: messages
    };

    let fullContent = "";
    let isDbtRuleResponse = false;
    
    for await (const { content, error } of asyncLLM(`${llmConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${llmConfig.apiKey}`
      },
      body: JSON.stringify(body),
    })) {
      if (error) throw new Error(`LLM API error: ${error}`);
      
      if (content) {
        fullContent = content;
        
        // Check if the content looks like a DBT rule modification response
        if (fullContent.includes("DBT_RULE_JSON:")) {
          isDbtRuleResponse = true;
          // Just show a loading indicator instead of streaming the JSON
          if (onUpdate && typeof onUpdate === 'function') {
            onUpdate("Generating DBT rule modifications...");
          }
        } else {
          // For regular chat, update with the content
          if (onUpdate && typeof onUpdate === 'function') {
            onUpdate(content);
          }
        }
      }
    }
    
    // Process the response
    let finalResponse = fullContent;
    let updatedRules = null;
    
    // Check if response contains DBT rule modifications
    if (isDbtRuleResponse) {
      try {
        // Extract the JSON part
        const jsonMatch = fullContent.match(/DBT_RULE_JSON:\s*(\{[\s\S]*\})/m);
        if (jsonMatch && jsonMatch[1]) {
          const ruleChangesJson = jsonMatch[1];
          const ruleChanges = JSON.parse(ruleChangesJson);
          
          // Process the rule changes
          const processResult = await processRuleChanges(context.dbtRules, ruleChanges);
          finalResponse = processResult.response;
          updatedRules = processResult.updatedRules;
        }
      } catch (error) {
        finalResponse = `Error processing DBT rule changes: ${error.message}. Here's the raw response:\n\n${fullContent}`;
      }
    }
    
    return {
      finalResponse,
      updatedRules
    };
  } catch (error) {
    throw new Error(`Chat response failed: ${error.message}`);
  }
}

/**
 * Process DBT rule changes and apply them to the current rules
 * @param {Object} currentRules - Current DBT rules
 * @param {Object} changes - Changes to apply
 * @returns {Object} Object containing response message and updated rules
 */
async function processRuleChanges(currentRules, changes) {
  if (!currentRules || !currentRules.dbtRules) {
    return {
      response: "Error: No existing DBT rules found. Please generate DBT rules first by clicking the 'Generate DBT Rules' button.",
      updatedRules: null
    };
  }
  
  try {
    // Make a deep copy of the current rules to avoid mutating the original
    const updatedRules = JSON.parse(JSON.stringify(currentRules));
    
    // Track what was changed for the response
    const changeLog = {
      added: [],
      modified: [],
      errors: []
    };
    
    // Process new or modified DBT rules
    if (changes.dbtRules) {
      for (const newRule of changes.dbtRules) {
        // Check if a rule with this table name already exists
        const existingRuleIndex = updatedRules.dbtRules.findIndex(rule => 
          rule.tableName === newRule.tableName);
        
        // Check if this is an explicit new rule (has special new_rule flag or has a unique table name)
        const isNewRule = newRule.isNewRule === true || existingRuleIndex === -1;
        
        if (existingRuleIndex >= 0 && !isNewRule) {
          // Rule exists and is not marked as new - merge changes into it
          const existingRule = updatedRules.dbtRules[existingRuleIndex];
          
          // Apply the changes directly to the existing rule
          Object.assign(existingRule, newRule);
          
          const modifiedTableName = newRule.tableName;
          changeLog.modified.push(`Modified rule for table '${modifiedTableName}'`);
          // Store the exact table name for accurate scrolling later
          changeLog.lastModifiedTable = modifiedTableName;
        } else {
          // New rule - add it
          // If this is a new rule with the same table name, ensure we don't have duplicate fields
          if (isNewRule && existingRuleIndex >= 0) {
            // It's a new rule for an existing table, so we should uniquely identify it
            // Add a suffix to make it unique if not already specified
            if (!newRule.tableName.includes("_new") && !newRule.tableName.includes("_additional")) {
              newRule.tableName = `${newRule.tableName}_additional`;
            }
          }
          
          // Remove any isNewRule flag if it exists (we don't need it in the stored data)
          delete newRule.isNewRule;
          
          // Add the new rule
          updatedRules.dbtRules.push(newRule);
          const newTableName = newRule.tableName;
          changeLog.added.push(`Added new rule for table '${newTableName}'`);
          // Store the exact table name for accurate scrolling later
          changeLog.lastModifiedTable = newTableName;
        }
      }
    }
    
    // Process updated global recommendations
    if (changes.globalRecommendations) {
      updatedRules.globalRecommendations = changes.globalRecommendations;
      changeLog.modified.push("Updated global recommendations");
    }
    
    // Process updated summary
    if (changes.summary) {
      updatedRules.summary = changes.summary;
      changeLog.modified.push("Updated summary");
    }
    
    // Format the response as markdown
    let response = "### DBT Rules Updated\n\n";
    
    // Include the last modified table in the response for scrolling
    const lastModifiedTable = changeLog.lastModifiedTable || "";
    
    if (changeLog.added.length) {
      response += "**Added:**\n";
      response += changeLog.added.map(item => `- ${item}`).join('\n');
      response += "\n\n";
    }
    
    if (changeLog.modified.length) {
      response += "**Modified:**\n";
      response += changeLog.modified.map(item => `- ${item}`).join('\n');
      response += "\n\n";
    }
    
    if (changeLog.errors.length) {
      response += "**Errors:**\n";
      response += changeLog.errors.map(item => `- ${item}`).join('\n');
      response += "\n\n";
    }
    
    // Export the updated rules data and last modified table for use by the caller
    response += "\n\n<!-- UPDATED_DBT_RULES:" + JSON.stringify(updatedRules) + " -->";
    response += "\n\n<!-- LAST_MODIFIED_TABLE:" + lastModifiedTable + " -->";
    
    return {
      response,
      updatedRules
    };
  } catch (error) {
    return {
      response: `Error processing rule changes: ${error.message}`,
      updatedRules: null
    };
  }
}

/**
 * Create prompt for DBT rules generation
 * @param {Object} schemaData - Generated schema information
 * @returns {String} Formatted prompt for the LLM
 */
function createDbtRulesPrompt(schemaData) {
  // Try to extract the seed name from the schema data
  // Look for any indication of the original file name
  let seedName = 'unknown';
  
  // Check if there's a fileName in the schema somewhere
  if (schemaData.fileName) {
    seedName = schemaData.fileName.replace(/^dataset-/, '').replace(/\.(xlsx|xls|csv)$/i, '');
  } else if (schemaData.schemas?.[0]?.sheetName) {
    // Sometimes the sheet name might contain the original info
    seedName = schemaData.schemas[0].sheetName.replace(/^dataset-/, '').replace(/\.(xlsx|xls|csv)$/i, '');
  }
  
  return getDefaultDbtRulesPrompt()
    .replace(/\$\{schemaData\}/g, JSON.stringify(schemaData))
    .replace(/pharma-trials/g, seedName);
}

/**
 * Extract summary from DBT rules
 * @param {Object} dbtRules - Generated DBT rules
 * @returns {String} Summary of DBT rules
 */
export function getDbtRulesSummary(dbtRules) {
  if (!dbtRules || !dbtRules.globalRecommendations) {
    return "No DBT rules summary available.";
  }
  
  // Join the global recommendations to create a summary
  return dbtRules.globalRecommendations.join("\n\n");
}

/**
 * Get default DBT rules generation prompt template
 * @returns {String} Default DBT rules prompt
 */
function getDefaultDbtRulesPrompt() {
  return `Based on the following schema information with relationships, generate comprehensive DBT rules including models, tests, and configurations.

Schema Data: \${schemaData}

For each table/schema, please provide:
1. Simple, reliable DBT model SQL that:
   - Selects ALL columns from the single seed table: SELECT * FROM {{ seed('seed_name') }}
   - Filters data for this specific entity/table if needed (WHERE conditions)
   - Uses simple transformations that are guaranteed to work
   - MUST successfully create the model table for tests to run against
   - Keep it simple to avoid compilation errors that prevent model creation
2. The seed table name should match the tableName from schema exactly
3. SQL should expose data quality issues that your tests will catch
4. Include meaningful transformations that help identify data problems
5. Appropriate tests for each column including relationship tests
6. Documentation configurations  
7. Any recommended materialization strategy

Include appropriate tests like:
- not_null (especially for primary keys and required foreign keys)
- unique (for primary keys and unique constraints)
- accepted_values (for categorical data)
- relationships (for foreign key validation using the identified relationships)
- custom tests where appropriate for data quality

For identified relationships:
- Generate relationships tests to validate foreign key constraints
- Include referential integrity tests
- Add tests for orphaned records if applicable

CRITICAL DBT DATA LOADING REQUIREMENTS:
- Data is loaded via dbt seeds, NOT sources
- The original dataset file becomes a SINGLE seed table (not separate tables per schema) 
- Based on the error "Did you mean pharma-trials?", the seed table is named "pharma-trials"
- ALL models must use: SELECT * FROM {{ seed('pharma-trials') }}
- Do NOT try to determine the seed name - always use "pharma-trials" for now
- Keep models extremely simple: just SELECT * FROM {{ seed('pharma-trials') }}
- Models will create tables (patients, prescriptions, etc.) from this single seed
- Tests then run on the created model tables, not the seed

CRITICAL: ALL models must use SELECT * FROM {{ seed('pharma-trials') }} - this is the seed table that exists.

CRITICAL YAML FORMATTING REQUIREMENTS:
- All string values in YAML must be properly quoted with double quotes
- Never use regex patterns or complex expressions that require escaping
- For email validation, use simple SQL: "email IS NULL OR LENGTH(email) > 5"  
- For phone validation, use: "phone IS NULL OR LENGTH(phone) >= 10"
- Never include debugging text, comments, or questions in YAML strings
- All test expressions must be valid DuckDB SQL that evaluates to boolean
- Use simple LENGTH, IS NULL, or basic comparison operators only
- Format all YAML content properly with correct indentation
- Avoid special characters like ~, ^, $, [], {}, () in test expressions

Please structure your response as a JSON object with the following format:
{
  "dbtRules": [
    {
      "tableName": "table_name",
      "modelSql": "-- Simple SQL that creates reliable model tables\n-- ALL models must use the same seed table\nSELECT * FROM {{ seed('pharma-trials') }}",
      "yamlConfig": "# YAML configuration for the model including tests, docs, and relationships\n# EXAMPLE:\n# models:\n#   - name: table_name\n#     columns:\n#       - name: email\n#         description: \"Email address\"\n#         tests:\n#           - not_null\n#           - dbt_utils.expression_is_true:\n#               expression: \"email IS NULL OR LENGTH(email) > 5\"",
      "tests": [
        {
          "column": "column_name", 
          "tests": ["test1", "test2"],
          "relationships": [
            {
              "test": "relationships",
              "to": "ref('target_table')",
              "field": "target_column"
            }
          ]
        }
      ],
      "recommendations": ["recommendation1", "recommendation2"],
      "materialization": "table|view|incremental|ephemeral",
      "relationships": [
        {
          "description": "Relationship description",
          "joinLogic": "SQL join logic for this relationship"
        }
      ]
    }
  ],
  "globalRecommendations": [
    "Overall DBT project recommendations",
    "Performance optimization suggestions",
    "Data quality strategy recommendations"
  ],
  "summary": "A concise summary of the generated DBT rules for both technical and non-technical users."
}`;
}