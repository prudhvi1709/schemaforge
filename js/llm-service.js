// Custom prompts (can be overridden by user)
let customPrompts = {
  schema: null,
  dbtRules: null
};

// Store chat history
let chatHistory = [];

// Import libraries
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@2";
import { parse } from "https://cdn.jsdelivr.net/npm/partial-json@0.1.7/+esm";
import { generateDbtRules, getDbtRulesSummary, handleDbtRuleChat } from "./dbt-generation.js";

// Re-export DBT functions for API compatibility
export { generateDbtRules, getDbtRulesSummary };

/**
 * Set custom prompts for schema and/or DBT rules generation
 * @param {Object} prompts - Object containing schema and/or dbtRules prompts
 */
export function setCustomPrompts(prompts) {
  if (prompts.schema !== undefined) customPrompts.schema = prompts.schema;
  if (prompts.dbtRules !== undefined) customPrompts.dbtRules = prompts.dbtRules;
}

/**
 * Get current prompts (custom or default)
 * @returns {Object} Object containing current schema and dbtRules prompts
 */
export function getCurrentPrompts() {
  return {
    schema: customPrompts.schema || getDefaultSchemaPrompt(),
    dbtRules: customPrompts.dbtRules || getDefaultDbtRulesPrompt()
  };
}

/**
 * Reset prompts to default
 */
export function resetPrompts() {
  customPrompts.schema = null;
  customPrompts.dbtRules = null;
}

/**
 * Reset chat history
 */
export function resetChatHistory() {
  chatHistory = [];
}

/**
 * Generate schema from file data using LLM with streaming
 * @param {Object} fileData - Parsed file data with headers and samples
 * @param {Object} llmConfig - LLM provider configuration
 * @param {Function} onUpdate - Callback function for streaming updates
 * @param {String} model - Model to use (optional, defaults to gpt-4.1-mini)
 * @returns {Object} Generated schema information
 */
export async function generateSchema(fileData, llmConfig, onUpdate, model = "gpt-4.1-mini") {
  try {
    const prompt = createSchemaPrompt(fileData);
    
    const body = {
      model: model,
      stream: true,
      messages: [
        {
          role: "system",
          content: "You are a data analysis assistant that generates detailed schema information from tabular data."
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
    return JSON.parse(fullContent);
  } catch (error) {
    throw new Error(`Schema generation failed: ${error.message}`);
  }
}

/**
 * Stream chat responses from LLM
 * @param {Object} context - Context data for the chat
 * @param {String} userMessage - User's message
 * @param {Object} llmConfig - LLM provider configuration
 * @param {Function} onUpdate - Callback function for streaming updates
 * @param {String} model - Model to use (optional, defaults to gpt-4.1-mini)
 * @returns {String} Final complete response
 */
export async function streamChatResponse(context, userMessage, llmConfig, onUpdate, model = "gpt-4.1-mini") {
  try {
    // Add user message to chat history
    chatHistory.push({
      role: "user",
      content: userMessage
    });
    
    // Check if this might be a DBT rule-related request
    // Use a simple heuristic to decide whether to use the standard chat or DBT rule handling
    const potentiallyDbtRelated = userMessage.toLowerCase().includes('rule') || 
                               userMessage.toLowerCase().includes('dbt');
    
    let finalResponse;
    
    if (potentiallyDbtRelated) {
      // Use the specialized DBT rule handler from the dbt-generation.js module
      const result = await handleDbtRuleChat(context, userMessage, llmConfig, onUpdate, model);
      finalResponse = result.finalResponse;
    } else {
      // Standard conversation flow
      const systemContent = [
        "You are a helpful assistant specializing in data analysis, schema design, and DBT rules. Answer questions about the uploaded data file, schema, or DBT rules.",
        context.attachedFile && `The user has attached a new file: ${context.attachedFile.name}. Here's the data: ${JSON.stringify(context.attachedFile)}.`,
        (context.fileData || context.schema || context.dbtRules) && `Here's information about the existing data context: ${JSON.stringify({
          fileData: context.fileData,
          schema: context.schema,
          dbtRules: context.dbtRules
        })}.`
      ].filter(Boolean).join(" ");
      
      const messages = [
        {
          role: "system",
          content: systemContent
        },
        ...chatHistory
      ];
      
      const body = {
        model: model,
        stream: true,
        messages: messages
      };

      let fullContent = "";
      
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
          
          // For regular chat, update with the content
          if (onUpdate && typeof onUpdate === 'function') {
            onUpdate(content);
          }
        }
      }
      
      finalResponse = fullContent;
    }
    
    // Add assistant response to chat history
    chatHistory.push({
      role: "assistant",
      content: finalResponse
    });
    
    return finalResponse;
  } catch (error) {
    throw new Error(`Chat response failed: ${error.message}`);
  }
}

/**
 * Create prompt for schema generation
 * @param {Object} fileData - Parsed file data
 * @returns {String} Formatted prompt for the LLM
 */
function createSchemaPrompt(fileData) {
  const template = customPrompts.schema || getDefaultSchemaPrompt();

  // Helper: pick random rows
  function getRandomRows(rows, count) {
    const shuffled = rows.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
  }

  // Prepare sheets data
  const sheetsData = fileData.sheets.map(sheet => {
    const sampleCount = Math.min(sheet.sampleRows.length, 5); // or any number you want
    const randomRows = getRandomRows(sheet.sampleRows, sampleCount);

    // TSV formatter - convert array of arrays to TSV format
    const tsvData = randomRows.map(row => {
      return row.map((value, index) => {
        const cellValue = value !== undefined && value !== null ? String(value) : '';
        return cellValue.replace(/\t/g, ' ').replace(/\n/g, ' ');
      }).join('\t');
    }).join('\n');

    return `
Sheet: ${sheet.name}
Headers: ${sheet.headers.join('\t')}
Sample Data (${randomRows.length} rows):
${tsvData}
`;
  }).join('\n');

  // Replace template variables
  return template
    .replace(/\$\{fileData\.name\}/g, fileData.name)
    .replace(/\$\{fileData\.type\}/g, fileData.type)
    .replace(/\$\{fileData\.sheets\}/g, sheetsData);
}

/**
 * Get default schema generation prompt template
 * @returns {String} Default schema prompt
 */
function getDefaultSchemaPrompt() {
  return `I need you to analyze this tabular data and generate a detailed schema with relational information.

File Name: \${fileData.name}
File Type: \${fileData.type}

\${fileData.sheets}

For each sheet/table, please analyze and provide:

1. **Column Analysis** (for each column):
   - Inferred data type
   - Column description
   - Whether it might contain PII/sensitive data (true/false)
   - Any data quality observations
   - Suggested constraints or validation rules
   - Whether it could be a primary key candidate
   - Whether it could be a foreign key (referencing another table)

2. **Relationship Analysis**:
   - Identify potential primary keys for each table
   - Identify potential foreign key relationships between tables
   - Suggest join patterns and relationships
   - Identify lookup/reference tables vs fact tables
   - Note any hierarchical relationships

3. **Data Modeling Insights**:
   - Table classification (fact, dimension, lookup, bridge, etc.)
   - Suggested table relationships (one-to-one, one-to-many, many-to-many)
   - Potential composite keys
   - Normalization recommendations

IMPORTANT: The relationships section is critical for visualizing an entity-relationship diagram. Always include at least one relationship between tables when possible. For each relationship, ensure you specify the fromTable, toTable, fromColumn, and toColumn fields.

Please structure your response as a JSON object with the following format:
{
  "schemas": [
    {
      "sheetName": "Sheet1",
      "tableName": "suggested_table_name",
      "description": "Description of this table/data",
      "tableType": "fact|dimension|lookup|bridge",
      "primaryKey": {
        "columns": ["column1", "column2"],
        "type": "simple|composite",
        "confidence": "high|medium|low"
      },
      "columns": [
        {
          "name": "column_name",
          "dataType": "inferred_type",
          "description": "column description",
          "isPII": boolean,
          "isPrimaryKey": boolean,
          "isForeignKey": boolean,
          "qualityObservations": ["observation1", "observation2"],
          "constraints": ["constraint1", "constraint2"],
          "flags": [
            { "label": "CUSTOM_FLAG", "class": "bg-secondary" }
          ],
          "foreignKeyReference": {
            "referencedTable": "table_name",
            "referencedColumn": "column_name",
            "confidence": "high|medium|low"
          }
        }
      ]
    }
  ],
  "relationships": [
    {
      "fromTable": "table1",
      "fromColumn": "column1", 
      "toTable": "table2",
      "toColumn": "column2",
      "relationshipType": "one-to-one|one-to-many|many-to-many",
      "joinType": "inner|left|right|full",
      "confidence": "high|medium|low",
      "description": "Description of the relationship"
    }
  ],
  "suggestedJoins": [
    {
      "description": "Common join pattern description",
      "sqlPattern": "SELECT * FROM table1 t1 JOIN table2 t2 ON t1.key = t2.key",
      "tables": ["table1", "table2"],
      "useCase": "What this join would be used for"
    }
  ],
  "modelingRecommendations": [
    "Recommendation 1 about data modeling",
    "Recommendation 2 about normalization",
    "Recommendation 3 about performance"
  ]
}`;
}

/**
 * Get default DBT rules generation prompt template
 * @returns {String} Default DBT rules prompt
 */
function getDefaultDbtRulesPrompt() {
  // This function is now maintained in dbt-generation.js, but we keep a stub here for API compatibility
  return `Based on the following schema information with relationships, generate comprehensive DBT rules including models, tests, and configurations.

Schema Data: \${schemaData}

// Full prompt content moved to dbt-generation.js`;
}