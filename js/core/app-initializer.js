/**
 * Application Initializer
 * Handles app initialization, configuration, and setup
 */

import { openaiConfig } from "https://cdn.jsdelivr.net/npm/bootstrap-llm-provider@1.2";
import { AppStorage } from '../utils/storage-utils.js';
import { getCurrentPrompts } from "../llm-service.js";
import { updateLlmConfigStatus } from './status-manager.js';
import { addEventListenerById } from '../utils/dom-utils.js';

let llmConfig = null;

/**
 * Get the currently selected model
 * @returns {String} Selected model name
 */
export function getSelectedModel() {
  return AppStorage.getSelectedModel();
}

/**
 * Get current LLM configuration
 * @returns {Object} LLM configuration
 */
export function getLLMConfig() {
  return llmConfig;
}

/**
 * Initialize the application
 */
export async function initializeApp() {
  await initLlmConfig();
  loadPromptsIntoTextareas();
}

/**
 * Initialize LLM configuration
 */
async function initLlmConfig() {
  try {
    // Try to get existing config without showing modal
    llmConfig = await openaiConfig({
      defaultBaseUrls: [
        "https://api.openai.com/v1",
        "https://openrouter.com/api/v1",
        "http://localhost:11434/v1",
      ],
      help: '<div class="alert alert-info">This app requires an LLM API to generate DBT rules from your data files. You can use OpenAI, OpenRouter, Ollama, or any OpenAI-compatible API.</div>',
      title: "LLM Provider Configuration",
      buttonLabel: "Save Configuration",
      show: false, // Don't force show on init
    });

    updateLlmConfigStatus("LLM configuration loaded successfully", "success");
  } catch (error) {
    console.log(
      "No existing LLM config found or error loading config:",
      error.message
    );
    updateLlmConfigStatus(
      "Click 'Configure LLM Provider' to set up your API provider",
      "info"
    );
  }
}

/**
 * Handle LLM configuration
 */
export async function handleConfigureLlm() {
  try {
    updateLlmConfigStatus("Opening configuration modal...", "info");

    llmConfig = await openaiConfig({
      defaultBaseUrls: [
        "https://api.openai.com/v1",
        "https://openrouter.com/api/v1",
        "http://localhost:11434/v1",
      ],
      help: '<div class="alert alert-info">This app requires an LLM API to generate DBT rules from your data files. You can use OpenAI, OpenRouter, Ollama, or any OpenAI-compatible API.</div>',
      title: "LLM Provider Configuration",
      buttonLabel: "Save Configuration",
      show: true, // Force show the modal
    });

    updateLlmConfigStatus("LLM configuration successful", "success");
  } catch (error) {
    updateLlmConfigStatus(
      `Failed to configure LLM: ${error.message}`,
      "danger"
    );
  }
}

/**
 * Load current prompts into the textareas
 */
function loadPromptsIntoTextareas() {
  const prompts = getCurrentPrompts();
  const schemaPromptElement = document.getElementById("schema-prompt");
  const dbtPromptElement = document.getElementById("dbt-prompt");
  const modelSelectElement = document.getElementById("model-select");
  
  if (schemaPromptElement) schemaPromptElement.value = prompts.schema;
  if (dbtPromptElement) dbtPromptElement.value = prompts.dbtRules;
  
  // Load saved model selection or default to gpt-4.1-mini
  if (modelSelectElement) {
    modelSelectElement.value = getSelectedModel();
  }
}

/**
 * Load sample datasets from config and render them as cards
 */
export async function loadSampleDatasets() {
  try {
    const response = await fetch('./config.json');
    const config = await response.json();
    return config.demos || [];
  } catch (error) {
    console.error('Failed to load sample datasets:', error);
    return [];
  }
}

/**
 * Setup sample datasets button listener
 */
export function setupSampleDatasetsListener() {
  addEventListenerById("sample-datasets-btn", "click", () => {
    const container = document.getElementById('sample-datasets-container');
    if (container && container.querySelectorAll('.sample-dataset-card').length === 0) {
      // This would call a function from ui-renderer to render the datasets
      loadAndRenderSampleDatasets();
    }
  });
}

/**
 * Load and render sample datasets
 */
async function loadAndRenderSampleDatasets() {
  const datasets = await loadSampleDatasets();
  // This would call a UI renderer function
  // renderSampleDatasets(datasets);
}