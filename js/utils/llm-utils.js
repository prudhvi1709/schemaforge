// File: js/utils/llm-utils.js
// Shared LLM API utility functions for SchemaForge

import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@2";
import { parse } from "https://cdn.jsdelivr.net/npm/partial-json@0.1.7/+esm";

/**
 * Make a streaming LLM API request with common configuration
 * @param {Object} llmConfig - LLM configuration { baseUrl, apiKey }
 * @param {Object} options - Request options
 * @param {string} options.system - System prompt
 * @param {string} options.user - User prompt
 * @param {string} options.model - Model to use (default: "gpt-4.1-mini")
 * @param {Object} [options.responseFormat] - Response format (e.g., { type: "json_object" })
 * @param {Array} [options.messages] - Override default messages array
 * @param {Function} [onUpdate] - Callback for streaming updates (receives parsed JSON for json_object format)
 * @returns {Promise<Object|string>} Parsed JSON response or full content string
 */
export async function streamLLMRequest(llmConfig, options, onUpdate) {
  const {
    system,
    user,
    model = "gpt-4.1-mini",
    responseFormat = null,
    messages = null
  } = options;

  const body = {
    model,
    stream: true,
    messages: messages || [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    ...(responseFormat && { response_format: responseFormat })
  };

  let fullContent = "";

  for await (const { content, error } of asyncLLM(`${llmConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${llmConfig.apiKey}`
    },
    body: JSON.stringify(body)
  })) {
    if (error) throw new Error(`LLM API error: ${error}`);

    if (content) {
      fullContent = content;

      if (onUpdate) {
        if (responseFormat?.type === "json_object") {
          try {
            const parsedContent = parse(fullContent);
            onUpdate(parsedContent);
          } catch {
            // Ignore parse errors for partial JSON content
          }
        } else {
          onUpdate(content);
        }
      }
    }
  }

  // Return parsed JSON for json_object format, otherwise return raw content
  if (responseFormat?.type === "json_object") {
    return JSON.parse(fullContent);
  }
  return fullContent;
}

/**
 * Make a non-streaming LLM API request (synchronous response)
 * @param {Object} llmConfig - LLM configuration { baseUrl, apiKey }
 * @param {Object} options - Request options
 * @param {string} options.system - System prompt
 * @param {string} options.user - User prompt
 * @param {string} options.model - Model to use (default: "gpt-4.1-mini")
 * @returns {Promise<string>} Response content
 */
export async function makeLLMRequest(llmConfig, options) {
  const { system, user, model = "gpt-4.1-mini" } = options;

  const response = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${llmConfig.apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || `HTTP ${response.status}`);
  }

  return data.choices[0].message.content.trim();
}

/**
 * Extract JSON from LLM response content
 * @param {string} content - Response content that may contain JSON
 * @returns {Object|null} Parsed JSON object or null if not found
 */
export function extractJsonFromResponse(content) {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

/**
 * Get current selected model from UI or localStorage
 * @returns {string} Model identifier
 */
export function getSelectedModel() {
  return document.getElementById("model-select")?.value ||
         localStorage.getItem('selectedModel') ||
         'gpt-4.1-mini';
}

/**
 * Get LLM configuration from window global (set by main.js)
 * @returns {Object|null} LLM config { baseUrl, apiKey }
 */
export function getLLMConfig() {
  return window.getLLMConfig?.() || null;
}
