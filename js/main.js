// File: js/main.js
// Main application entry point - orchestrates SchemaForge workflow
// Refactored to use shared utility modules and handlers (DRY principle)

import { html, render } from "lit-html";
import { openaiConfig } from "https://cdn.jsdelivr.net/npm/bootstrap-llm-provider@1.2";
import { parseFile, parseFileFromUrl } from "./file-parser.js";
import {
  generateSchema,
  generateDbtRules,
  setCustomPrompts,
  getCurrentPrompts,
  resetPrompts,
} from "./llm-service.js";
import {
  renderResults,
  renderSchemaResults,
  renderSchemaOverview,
  renderColumnDescriptions,
  renderRelationships,
  renderJoinsAndModeling,
  renderChatMessage,
} from "./ui.js";
import { renderDataIngestion } from "./data-ingestion.js";
import { exportDbtLocalZip } from "./dbt-local-service.js";
import { DataComparator } from "./comparator.js";

// Import from shared utilities (DRY - centralized)
import { $, setLoading, updateStatus } from "./utils/dom-utils.js";

// Import from handlers (extracted functionality)
import {
  setupChatFileListeners,
  setupChatResize,
  toggleFloatingChat,
  handleResetChat,
  handleChatSubmit as chatSubmitHandler,
  formatChatMessageWithMarked,
  clearChatFile
} from "./handlers/chat-handlers.js";
import {
  handleSampleDatasetsClick,
  expandAllCards
} from "./handlers/dataset-handlers.js";

// Module state
let fileData = null, schemaData = null, dbtRulesData = null, llmConfig = null;
let dataComparator = null;

window.currentFileData = null;

/**
 * Get currently selected LLM model from UI or localStorage
 * @returns {string} Model identifier
 */
function getSelectedModel() {
  return $("model-select")?.value || localStorage.getItem('selectedModel') || 'gpt-4.1-mini';
}

/**
 * Get current LLM configuration
 * @returns {Object|null} LLM config { baseUrl, apiKey }
 */
function getLLMConfig() {
  return llmConfig;
}

async function init() {
  setupEventListeners();
  await initLlmConfig();
  await loadPromptsIntoTextareas();
  initializeComparator();
}

function initializeComparator() {
  dataComparator = new DataComparator();
}

// Update comparator file status when file data changes
function updateComparatorStatus() {
  if (dataComparator) {
    dataComparator.updateFileStatus();
  }
}

/**
 * Set up all event listeners for the application
 */
function setupEventListeners() {
  const eventMap = {
    "upload-form": { event: "submit", handler: handleFileUpload },
    "run-dbt-locally-btn": { event: "click", handler: handleRunDbtLocally },
    "configure-llm-btn": { event: "click", handler: handleConfigureLlm },
    "generate-dbt-btn": { event: "click", handler: handleGenerateDbtRules },
    "save-prompts-btn": { event: "click", handler: handleSavePrompts },
    "reset-prompts-btn": { event: "click", handler: handleResetPrompts },
    "chat-float-btn": { event: "click", handler: toggleFloatingChat },
    "close-chat-btn": { event: "click", handler: toggleFloatingChat },
    "reset-chat-btn-floating": { event: "click", handler: handleResetChat },
    "chat-form-floating": { event: "submit", handler: handleChatSubmit },
    "sample-datasets-btn": { event: "click", handler: handleSampleDatasetsClick }
  };

  Object.entries(eventMap).forEach(([id, { event, handler }]) => {
    $(id)?.addEventListener(event, handler);
  });

  // Setup chat functionality (imported from handlers)
  setupChatFileListeners();
  setupChatResize();
}

/**
 * Load prompt templates into their respective textareas
 */
async function loadPromptsIntoTextareas() {
  const prompts = await getCurrentPrompts();
  $("schema-prompt").value = prompts.schema;
  $("dbt-prompt").value = prompts.dbtRules;
  const savedModel = localStorage.getItem('selectedModel') || 'gpt-4.1-mini';
  $("model-select").value = savedModel;
}

/**
 * Save custom prompts and model selection
 */
function handleSavePrompts() {
  const schemaPrompt = $("schema-prompt").value.trim();
  const dbtPrompt = $("dbt-prompt").value.trim();
  const selectedModel = $("model-select").value;

  if (!schemaPrompt || !dbtPrompt) {
    return updateStatus("Please fill in both prompts before saving", "warning");
  }

  setCustomPrompts({ schema: schemaPrompt, dbtRules: dbtPrompt });
  localStorage.setItem('selectedModel', selectedModel);
  updateStatus("Custom prompts and model selection saved successfully", "success");
}

/**
 * Reset prompts and model selection to defaults
 */
async function handleResetPrompts() {
  resetPrompts();
  await loadPromptsIntoTextareas();
  $("model-select").value = 'gpt-4.1-mini';
  localStorage.setItem('selectedModel', 'gpt-4.1-mini');
  updateStatus("Prompts and model selection reset to default", "info");
}

/**
 * Get global table classification rules from input
 * @returns {string} Table rules or empty string
 */
function getGlobalTableRules() {
  const rulesInput = $('table-classification-rules');
  return rulesInput ? rulesInput.value.trim() : '';
}

/**
 * Process file data and generate schema
 * @param {Object} data - Parsed file data
 * @param {string} name - Optional file name for status message
 */
async function processFile(data, name = null) {
  fileData = data;
  window.currentFileData = fileData;
  $("results-container").classList.remove("d-none");

  // Update comparator status with new file data
  updateComparatorStatus();

  schemaData = { schemas: [], relationships: [], suggestedJoins: [], modelingRecommendations: [] };
  renderSchemaResults(schemaData);
  updateStatus("Generating schema...", "info");

  const globalTableRules = getGlobalTableRules();
  schemaData = await generateSchema(fileData, llmConfig, (partialData) => {
    if (partialData) {
      if (!partialData.relationships) partialData.relationships = [];
      renderSchemaOverview(partialData);
      renderColumnDescriptions(partialData);
      renderRelationships(partialData);
      renderJoinsAndModeling(partialData);
    }
  }, getSelectedModel(), globalTableRules);

  if (!schemaData.relationships) schemaData.relationships = [];
  renderSchemaResults(schemaData);
  window.currentSchemaData = schemaData;
  renderDataIngestion(schemaData);
  $("generate-dbt-btn").classList.remove("d-none");
  updateStatus(`Schema generation complete${name ? ` for ${name}` : ''}!`, "success");
}

// Expose processFile for dataset handlers
window.processSchemaForgeFile = processFile;

const llmConfigOptions = {
  defaultBaseUrls: ["https://api.openai.com/v1", "https://openrouter.com/api/v1", "http://localhost:11434/v1"],
  help: '<div class="alert alert-info">This app requires an LLM API to generate DBT rules from your data files. You can use OpenAI, OpenRouter, Ollama, or any OpenAI-compatible API.</div>',
  title: "LLM Provider Configuration",
  buttonLabel: "Save Configuration",
  show: false,
};

async function initLlmConfig() {
  try {
    llmConfig = await openaiConfig(llmConfigOptions);
    updateLlmConfigStatus("LLM configuration loaded successfully", "success");
  } catch (error) {
    updateLlmConfigStatus("Click 'Configure LLM Provider' to set up your API provider", "info");
  }
}

async function handleConfigureLlm() {
  try {
    updateLlmConfigStatus("Opening configuration modal...", "info");
    llmConfig = await openaiConfig({ ...llmConfigOptions, show: true });
    updateLlmConfigStatus("LLM configuration successful", "success");
  } catch (error) {
    updateLlmConfigStatus(`Failed to configure LLM: ${error.message}`, "danger");
  }
}

function updateLlmConfigStatus(message, type = "info") {
  const configContainer = document.getElementById("llm-config-container");
  configContainer.querySelectorAll(".alert").forEach(alert => alert.remove());
  
  const tempContainer = document.createElement("div");
  render(html`<div class="alert alert-${type} mt-2">${message}</div>`, tempContainer);
  
  const existingText = configContainer.querySelector(".text-muted");
  (existingText || configContainer).appendChild(tempContainer.firstElementChild);
  
  if (type === "success" || type === "info") {
    setTimeout(() => {
      const alert = configContainer.querySelector(`.alert-${type}`);
      if (alert && alert.textContent.trim() === message) alert.remove();
    }, 5000);
  }
}

/**
 * Handle file upload form submission
 * @param {Event} event - Form submit event
 */
async function handleFileUpload(event) {
  event.preventDefault();
  const file = $("file-input").files[0];

  if (!file) return updateStatus("Please select a file to upload", "warning");
  if (!llmConfig) return updateStatus("Please configure LLM settings first by clicking 'Configure LLM Provider'", "warning");

  setLoading("upload", true);
  updateStatus("Processing file...", "info");

  try {
    await processFile(await parseFile(file));
    updateStatus("Schema generation complete! Click 'Generate DBT Rules' to proceed.", "success");
  } catch (error) {
    updateStatus(`Error: ${error.message}`, "danger");
  } finally {
    setLoading("upload", false);
  }
}

/**
 * Handle DBT rules generation
 */
async function handleGenerateDbtRules() {
  if (!schemaData || !llmConfig) {
    return updateStatus("Please upload a file and generate schema first", "warning");
  }

  setLoading("generate-dbt", true);
  updateStatus("Generating DBT rules...", "info");

  try {
    dbtRulesData = { dbtRules: [], globalRecommendations: [] };
    renderResults(schemaData, dbtRulesData);

    dbtRulesData = await generateDbtRules(schemaData, llmConfig, (partialData) => {
      if (partialData) renderResults(schemaData, partialData);
    }, getSelectedModel());

    window.currentDbtRulesData = dbtRulesData;
    $("chat-float-btn").classList.remove("d-none");
    $("generate-dbt-btn").classList.add("d-none");
    updateStatus("DBT rules generation complete!", "success");
  } catch (error) {
    updateStatus(`Error generating DBT rules: ${error.message}`, "danger");
  } finally {
    setLoading("generate-dbt", false);
  }
}

/**
 * Handle export to local DBT project
 */
function handleRunDbtLocally() {
  const checks = [
    [schemaData, "No data available to export"],
    [dbtRulesData?.dbtRules, "DBT rules are required for local development. Please generate DBT rules first."],
    [fileData?._originalFileContent, "Original dataset file is required for local development. Please upload a file first."]
  ];

  for (const [data, message] of checks) {
    if (!data) return updateStatus(message, "warning");
  }

  exportDbtLocalZip(schemaData, dbtRulesData, updateStatus, fileData);
}

/**
 * Handle chat form submission - wraps the imported handler with context
 * @param {Event} event - Form submit event
 */
async function handleChatSubmit(event) {
  const context = {
    fileData,
    schemaData,
    dbtRulesData,
    llmConfig,
    getSelectedModel
  };

  const onDbtRulesUpdate = (updatedRules, response) => {
    dbtRulesData = updatedRules;
    renderResults(schemaData, dbtRulesData);
  };

  await chatSubmitHandler(event, context, onDbtRulesUpdate);
}

window.expandAllCards = expandAllCards;
window.getSelectedModel = getSelectedModel;
window.getLLMConfig = getLLMConfig;
window.handleRunDbtLocally = handleRunDbtLocally;
window.updateStatus = updateStatus;
window.updateComparatorStatus = updateComparatorStatus;

document.addEventListener("DOMContentLoaded", init);