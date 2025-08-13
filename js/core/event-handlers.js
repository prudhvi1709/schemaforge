/**
 * Event Handlers
 * Central event handling and user interaction management
 */

import { parseFile, parseFileFromUrl } from "../file-parser.js";
import { generateSchema, generateDbtRules, setCustomPrompts, resetPrompts } from "../llm-service.js";
import { exportDbtLocalZip } from "../dbt-local-service.js";
import { handleConfigureLlm, getSelectedModel, getLLMConfig } from "./app-initializer.js";
import { updateStatus, setLoading } from "./status-manager.js";
import { renderDataIngestion } from "../data-ingestion.js";
import { renderResults, renderSchemaResults, renderSchemaOverview, renderColumnDescriptions, renderRelationships, renderJoinsAndModeling } from "../ui.js";
import { addMultipleEventListeners, setupDragDrop } from '../utils/dom-utils.js';
import { AppStorage } from '../utils/storage-utils.js';
import { validateRequiredFields } from '../utils/validation-utils.js';

// Global state
let fileData = null;
let schemaData = null;
let dbtRulesData = null;

/**
 * Setup all event listeners
 */
export function setupEventListeners() {
  setupFormHandlers();
  setupAdvancedSettingsHandlers();
  setupChatHandlers();
  setupFileHandlers();
}

/**
 * Setup main form event handlers
 */
function setupFormHandlers() {
  const formHandlers = {
    "upload-form": { "submit": handleFileUpload },
    "configure-llm-btn": { "click": handleConfigureLlm },
    "generate-dbt-btn": { "click": handleGenerateDbtRules },
    "run-dbt-locally-btn": { "click": handleRunDbtLocally }
  };

  Object.entries(formHandlers).forEach(([elementId, events]) => {
    addMultipleEventListeners(elementId, events);
  });
}

/**
 * Setup advanced settings event handlers
 */
function setupAdvancedSettingsHandlers() {
  const advancedHandlers = {
    "save-prompts-btn": { "click": handleSavePrompts },
    "reset-prompts-btn": { "click": handleResetPrompts }
  };

  Object.entries(advancedHandlers).forEach(([elementId, events]) => {
    addMultipleEventListeners(elementId, events);
  });
}

/**
 * Setup chat-related event handlers
 */
function setupChatHandlers() {
  const chatHandlers = {
    "chat-float-btn": { "click": toggleFloatingChat },
    "close-chat-btn": { "click": toggleFloatingChat },
    "reset-chat-btn-floating": { "click": handleResetChat },
    "chat-form-floating": { "submit": handleChatSubmit }
  };

  Object.entries(chatHandlers).forEach(([elementId, events]) => {
    addMultipleEventListeners(elementId, events);
  });

  setupChatFileListeners();
}

/**
 * Setup file handling event handlers
 */
function setupFileHandlers() {
  setupChatFileListeners();
  
  // Setup drag and drop for chat
  setupDragDrop("chat-drop-zone", handleChatFileSelect);
}

/**
 * Handle file upload
 * @param {Event} event - Form submit event
 */
export async function handleFileUpload(event) {
  event.preventDefault();

  const fileInput = document.getElementById("file-input");
  const file = fileInput.files[0];

  // Validate required inputs
  const validation = validateRequiredFields({ file }, ['file']);
  if (!validation.valid) {
    updateStatus("Please select a file to upload", "warning");
    return;
  }

  const llmConfig = getLLMConfig();
  if (!llmConfig) {
    updateStatus(
      "Please configure LLM settings first by clicking 'Configure LLM Provider'",
      "warning"
    );
    return;
  }

  setLoading("upload", true);
  updateStatus("Processing file...", "info");

  try {
    // Parse the file to extract headers and sample data
    fileData = await parseFile(file);
    
    // Store file data globally for data ingestion
    window.currentFileData = fileData;

    // Show results container early to display streaming content
    document.getElementById("results-container").classList.remove("d-none");

    // Initialize empty schema data to start rendering
    schemaData = {
      schemas: [],
      relationships: [],
      suggestedJoins: [],
      modelingRecommendations: [],
    };

    // Render initial empty schema
    renderSchemaResults(schemaData);

    // Generate schema with streaming updates
    updateStatus("Generating schema...", "info");
    schemaData = await generateSchema(fileData, llmConfig, (partialData) => {
      // Update UI with partial data as it streams in
      if (partialData) {
        // Ensure relationships array exists in partial data
        if (!partialData.relationships) {
          partialData.relationships = [];
        }
        
        // During streaming, only update text-based tabs, not the diagram
        renderSchemaOverview(partialData);
        renderColumnDescriptions(partialData);
        renderRelationships(partialData);
        renderJoinsAndModeling(partialData);
      }
    }, getSelectedModel());

    // Ensure relationships array exists in final data
    if (!schemaData.relationships) {
      schemaData.relationships = [];
    }

    // After streaming is complete, render the full results including the diagram
    renderSchemaResults(schemaData);
    
    // Store schema data globally for export
    window.currentSchemaData = schemaData;
    
    // Render data ingestion interface
    renderDataIngestion(schemaData);

    // Show generate DBT rules button
    document.getElementById("generate-dbt-btn").classList.remove("d-none");

    updateStatus(
      "Schema generation complete! Click 'Generate DBT Rules' to proceed.",
      "success"
    );
  } catch (error) {
    updateStatus(`Error: ${error.message}`, "danger");
  } finally {
    setLoading("upload", false);
  }
}

/**
 * Handle DBT rules generation
 */
export async function handleGenerateDbtRules() {
  const llmConfig = getLLMConfig();
  
  if (!schemaData || !llmConfig) {
    updateStatus("Please upload a file and generate schema first", "warning");
    return;
  }

  setLoading("generate-dbt", true);
  updateStatus("Generating DBT rules...", "info");

  try {
    // Initialize empty DBT rules data to start rendering
    dbtRulesData = {
      dbtRules: [],
      globalRecommendations: [],
    };

    // Render initial state with schema and empty DBT rules
    renderResults(schemaData, dbtRulesData);

    // Generate DBT rules with streaming updates
    dbtRulesData = await generateDbtRules(
      schemaData,
      llmConfig,
      (partialData) => {
        // Update UI with partial data as it streams in
        if (partialData) {
          renderResults(schemaData, partialData);
        }
      },
      getSelectedModel()
    );

    // Store DBT data globally for export
    window.currentDbtRulesData = dbtRulesData;

    // Show chat button and hide generate DBT button
    document.getElementById("chat-float-btn").classList.remove("d-none");
    document.getElementById("generate-dbt-btn").classList.add("d-none");

    updateStatus("DBT rules generation complete!", "success");
  } catch (error) {
    updateStatus(`Error generating DBT rules: ${error.message}`, "danger");
  } finally {
    setLoading("generate-dbt", false);
  }
}

/**
 * Handle saving custom prompts
 */
export function handleSavePrompts() {
  const schemaPrompt = document.getElementById("schema-prompt").value.trim();
  const dbtPrompt = document.getElementById("dbt-prompt").value.trim();
  const selectedModel = document.getElementById("model-select").value;

  const validation = validateRequiredFields({ schemaPrompt, dbtPrompt }, ['schemaPrompt', 'dbtPrompt']);
  if (!validation.valid) {
    updateStatus("Please fill in both prompts before saving", "warning");
    return;
  }

  setCustomPrompts({
    schema: schemaPrompt,
    dbtRules: dbtPrompt,
  });

  // Save selected model
  AppStorage.setSelectedModel(selectedModel);

  updateStatus("Custom prompts and model selection saved successfully", "success");
}

/**
 * Handle resetting prompts to default
 */
export function handleResetPrompts() {
  resetPrompts();
  
  // Reset UI elements
  const prompts = getCurrentPrompts();
  document.getElementById("schema-prompt").value = prompts.schema;
  document.getElementById("dbt-prompt").value = prompts.dbtRules;
  document.getElementById("model-select").value = 'gpt-4.1-mini';
  
  AppStorage.setSelectedModel('gpt-4.1-mini');
  updateStatus("Prompts and model selection reset to default", "info");
}

/**
 * Handle running DBT locally
 */
export function handleRunDbtLocally() {
  if (!schemaData) {
    updateStatus("No data available to export", "warning");
    return;
  }
  
  if (!dbtRulesData || !dbtRulesData.dbtRules) {
    updateStatus("DBT rules are required for local development. Please generate DBT rules first.", "warning");
    return;
  }
  
  if (!fileData || !fileData._originalFileContent) {
    updateStatus("Original dataset file is required for local development. Please upload a file first.", "warning");
    return;
  }
  
  exportDbtLocalZip(schemaData, dbtRulesData, updateStatus, fileData);
}

/**
 * Handle resetting chat history
 */
export function handleResetChat() {
  // This would be implemented by the chat module
  // resetChatHistory();
  // clearChatFile();
  updateStatus("Chat history has been reset", "info");
}

/**
 * Toggle the floating chat visibility
 */
export function toggleFloatingChat() {
  const chatContainer = document.getElementById("chat-container-floating");
  
  // Toggle between d-none and d-block
  if (chatContainer.classList.contains("d-none")) {
    chatContainer.classList.remove("d-none");
    chatContainer.classList.add("d-block");
    // If showing the chat, focus on the input
    document.getElementById("chat-input-floating").focus();
  } else {
    chatContainer.classList.remove("d-block");
    chatContainer.classList.add("d-none");
  }
}

/**
 * Handle chat submission
 * @param {Event} event - Form submit event
 */
export async function handleChatSubmit(event) {
  event.preventDefault();
  
  // This would be implemented by the chat module
  // The actual chat logic would be extracted to a separate chat manager
}

/**
 * Setup chat file attachment listeners
 */
function setupChatFileListeners() {
  const fileHandlers = {
    "chat-attach-btn": { "click": () => document.getElementById("chat-file-input").click() },
    "chat-file-input": { "change": (e) => e.target.files[0] && handleChatFileSelect(e.target.files[0]) },
    "chat-file-remove": { "click": clearChatFile }
  };

  Object.entries(fileHandlers).forEach(([elementId, events]) => {
    addMultipleEventListeners(elementId, events);
  });
}

/**
 * Handle chat file selection
 * @param {File} file - Selected file
 */
function handleChatFileSelect(file) {
  // Store attached file
  window.chatAttachedFile = file;
  document.getElementById("chat-file-name").textContent = file.name;
  document.getElementById("chat-file-preview").classList.remove("d-none");
}

/**
 * Clear chat file attachment
 */
function clearChatFile() {
  window.chatAttachedFile = null;
  document.getElementById("chat-file-preview").classList.add("d-none");
  document.getElementById("chat-file-input").value = '';
}

// Export global state getters
export function getFileData() { return fileData; }
export function getSchemaData() { return schemaData; }
export function getDbtRulesData() { return dbtRulesData; }