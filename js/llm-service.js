import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@2";
import { parse } from "https://cdn.jsdelivr.net/npm/partial-json@0.1.7/+esm";
import { generateDbtRules, getDbtRulesSummary, handleDbtRuleChat } from "./dbt-generation.js";

let customPrompts = { schema: null, dbtRules: null };
let chatHistory = [];

export { generateDbtRules, getDbtRulesSummary };

export const setCustomPrompts = (prompts) => {
  if (prompts.schema !== undefined) customPrompts.schema = prompts.schema;
  if (prompts.dbtRules !== undefined) customPrompts.dbtRules = prompts.dbtRules;
};

export const getCurrentPrompts = () => ({
  schema: customPrompts.schema || getDefaultSchemaPrompt(),
  dbtRules: customPrompts.dbtRules || getDefaultDbtRulesPrompt()
});

export const resetPrompts = () => { customPrompts = { schema: null, dbtRules: null }; };
export const resetChatHistory = () => { chatHistory = []; };

export async function generateSchema(fileData, llmConfig, onUpdate, model = "gpt-4.1-mini", globalTableRules = "") {
  const body = {
    model,
    stream: true,
    messages: [
      { role: "system", content: "Data analysis assistant generating schema from tabular data." },
      { role: "user", content: createSchemaPrompt(fileData, globalTableRules) }
    ],
    response_format: { type: "json_object" }
  };

  let fullContent = "", parsedContent = null;
  
  for await (const { content, error } of asyncLLM(`${llmConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${llmConfig.apiKey}` },
    body: JSON.stringify(body)
  })) {
    if (error) throw new Error(`API error: ${error}`);
    if (content) {
      fullContent = content;
      try {
        parsedContent = parse(fullContent);
        onUpdate?.(parsedContent);
      } catch {}
    }
  }
  
  return JSON.parse(fullContent);
}

export async function streamChatResponse(context, userMessage, llmConfig, onUpdate, model = "gpt-4.1-mini") {
  chatHistory.push({ role: "user", content: userMessage });
  
  const systemPrompt = `You are a helpful assistant for data analysis, schema design, and DBT. 
Context: ${JSON.stringify({ fileData: context.fileData?.headers, schema: context.schema?.schemas?.[0]?.tableName, dbtRules: context.dbtRules?.dbtRules?.length })}`;

  const messages = [{ role: "system", content: systemPrompt }, ...chatHistory.slice(-10)];
  
  const response = await handleDbtRuleChat(context, userMessage, llmConfig, onUpdate, model);
  
  if (response.updatedRules) {
    chatHistory.push({ role: "assistant", content: response.finalResponse });
    return response.finalResponse;
  }
  
  const body = { model, stream: true, messages };
  let fullContent = "";
  
  for await (const { content, error } of asyncLLM(`${llmConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${llmConfig.apiKey}` },
    body: JSON.stringify(body)
  })) {
    if (error) throw new Error(`API error: ${error}`);
    if (content) {
      fullContent = content;
      onUpdate?.(content);
    }
  }
  
  chatHistory.push({ role: "assistant", content: fullContent });
  return fullContent;
}

const createSchemaPrompt = (fileData, globalTableRules) => {
  const sampleData = fileData.headers?.slice(0, 10).map(header => ({
    column: header,
    samples: fileData.rows?.slice(0, 5).map(row => row[header]).filter(v => v != null)
  }));

  return `Analyze this data and generate comprehensive schema information:

**File:** ${fileData.name || 'Unknown'}
**Sample Data:** ${JSON.stringify(sampleData)}
${globalTableRules ? `**Rules:** ${globalTableRules}` : ''}

Generate detailed schema with:
- Column analysis (type, description, constraints)
- Primary/foreign key identification  
- Data quality observations
- Relationship detection
- Modeling recommendations

Return JSON:
{
  "schemas": [{
    "tableName": "table_name",
    "description": "description",
    "columns": [{"name": "col", "dataType": "type", "description": "desc", "isPrimaryKey": false, "isForeignKey": false, "isPII": false}],
    "primaryKey": {"columns": ["col"], "type": "natural", "confidence": "high"}
  }],
  "relationships": [{"fromTable": "a", "toTable": "b", "fromColumn": "x", "toColumn": "y", "relationshipType": "one-to-many"}],
  "suggestedJoins": [{"description": "join desc", "useCase": "use case", "tables": ["a","b"], "sqlPattern": "SQL"}],
  "modelingRecommendations": ["rec1", "rec2"]
}`;
};

const getDefaultSchemaPrompt = () => "Generate detailed schema from file data with comprehensive analysis.";
const getDefaultDbtRulesPrompt = () => "Generate DBT rules including models, tests, and configurations from schema.";