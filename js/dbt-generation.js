// Import libraries
import { parse } from "https://cdn.jsdelivr.net/npm/partial-json@0.1.7/+esm";
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@2";

/**
 * Generate DBT rules from schema using LLM with streaming
 * @param {Object} schemaData - Generated schema information
 * @param {Object} llmConfig - LLM provider configuration
 * @param {Function} onUpdate - Callback function for streaming updates
 * @param {String} model - Model to use (optional, defaults to gpt-4.1-mini)
 * @returns {Object} Generated DBT rules with summary
 */
export async function generateDbtRules(schemaData, llmConfig, onUpdate, model = "gpt-4.1-mini") {
  try {
    const prompt = createDbtRulesPrompt(schemaData);
    
    const body = {
      model: model,
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
export async function handleDbtRuleChat(context, userMessage, llmConfig, onUpdate, model = "gpt-4.1-mini") {
  const messages = [{
    role: "system",
    content: `DBT assistant. For rule modifications, respond with "DBT_RULE_JSON:" + JSON. Context: ${JSON.stringify(context)}`
  }, { role: "user", content: userMessage }];
  
  const body = { model, stream: true, messages };
  let fullContent = "", isDbtRuleResponse = false;
  
  for await (const { content, error } of asyncLLM(`${llmConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${llmConfig.apiKey}` },
    body: JSON.stringify(body)
  })) {
    if (error) throw new Error(`API error: ${error}`);
    if (content) {
      fullContent = content;
      if (fullContent.includes("DBT_RULE_JSON:")) {
        isDbtRuleResponse = true;
        onUpdate?.("Generating DBT rule modifications...");
      } else {
        onUpdate?.(content);
      }
    }
  }
  
  let finalResponse = fullContent, updatedRules = null;
  if (isDbtRuleResponse) {
    try {
      const jsonMatch = fullContent.match(/DBT_RULE_JSON:\s*(\{[\s\S]*\})/m);
      if (jsonMatch?.[1]) {
        const ruleChanges = JSON.parse(jsonMatch[1]);
        const processResult = await processRuleChanges(context.dbtRules, ruleChanges);
        finalResponse = processResult.response;
        updatedRules = processResult.updatedRules;
      }
    } catch (error) {
      finalResponse = `Error: ${error.message}\n\n${fullContent}`;
    }
  }
  return { finalResponse, updatedRules };
}

/**
 * Process DBT rule changes and apply them to the current rules
 * @param {Object} currentRules - Current DBT rules
 * @param {Object} changes - Changes to apply
 * @returns {Object} Object containing response message and updated rules
 */
async function processRuleChanges(currentRules, changes) {
  if (!currentRules?.dbtRules) {
    return { response: "Error: Generate DBT rules first.", updatedRules: null };
  }
  
  try {
    const updatedRules = JSON.parse(JSON.stringify(currentRules));
    const changeLog = { added: [], modified: [], errors: [], lastModifiedTable: "" };
    
    if (changes.dbtRules) {
      for (const newRule of changes.dbtRules) {
        const existingRuleIndex = updatedRules.dbtRules.findIndex(rule => rule.tableName === newRule.tableName);
        const isNewRule = newRule.isNewRule === true || existingRuleIndex === -1;
        
        if (existingRuleIndex >= 0 && !isNewRule) {
          Object.assign(updatedRules.dbtRules[existingRuleIndex], newRule);
          changeLog.modified.push(`Modified rule for table '${newRule.tableName}'`);
          changeLog.lastModifiedTable = newRule.tableName;
        } else {
          if (isNewRule && existingRuleIndex >= 0 && !newRule.tableName.includes("_new") && !newRule.tableName.includes("_additional")) {
            newRule.tableName = `${newRule.tableName}_additional`;
          }
          delete newRule.isNewRule;
          updatedRules.dbtRules.push(newRule);
          changeLog.added.push(`Added new rule for table '${newRule.tableName}'`);
          changeLog.lastModifiedTable = newRule.tableName;
        }
      }
    }
    
    if (changes.globalRecommendations) {
      updatedRules.globalRecommendations = changes.globalRecommendations;
      changeLog.modified.push("Updated global recommendations");
    }
    
    if (changes.summary) {
      updatedRules.summary = changes.summary;
      changeLog.modified.push("Updated summary");
    }
    
    let response = "### DBT Rules Updated\n\n";
    if (changeLog.added.length) response += "**Added:**\n" + changeLog.added.map(item => `- ${item}`).join('\n') + "\n\n";
    if (changeLog.modified.length) response += "**Modified:**\n" + changeLog.modified.map(item => `- ${item}`).join('\n') + "\n\n";
    if (changeLog.errors.length) response += "**Errors:**\n" + changeLog.errors.map(item => `- ${item}`).join('\n') + "\n\n";
    
    response += "\n\n<!-- UPDATED_DBT_RULES:" + JSON.stringify(updatedRules) + " -->";
    response += "\n\n<!-- LAST_MODIFIED_TABLE:" + changeLog.lastModifiedTable + " -->";
    
    return { response, updatedRules };
  } catch (error) {
    return { response: `Error: ${error.message}`, updatedRules: null };
  }
}

const createDbtRulesPrompt = (schemaData) => getDefaultDbtRulesPrompt().replace(/\$\{schemaData\}/g, JSON.stringify(schemaData));

export const getDbtRulesSummary = (dbtRules) => 
  dbtRules?.globalRecommendations ? dbtRules.globalRecommendations.join("\n\n") : "No summary available.";

const getDefaultDbtRulesPrompt = () => 
  `Generate DBT rules from schema data: \${schemaData}

Requirements:
- Use {{ ref('seed_name') }} format for references
- Only create tests for existing columns
- Include not_null, unique, relationships tests

Return JSON:
{
  "dbtRules": [{
    "tableName": "name",
    "modelSql": "SELECT * FROM {{ ref('seed') }}",
    "tests": [{"column": "col", "tests": ["not_null"]}],
    "materialization": "table"
  }],
  "globalRecommendations": ["recommendations"],
  "summary": "Brief summary"
}`;