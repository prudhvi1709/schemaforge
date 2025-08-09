import { html, render } from "lit-html";
import { openaiConfig } from "https://cdn.jsdelivr.net/npm/bootstrap-llm-provider@1.2";
import { parseFile, parseFileFromUrl } from "./file-parser.js";
import {
  generateSchema,
  generateDbtRules,
  setCustomPrompts,
  getCurrentPrompts,
  resetPrompts,
  streamChatResponse,
  resetChatHistory,
} from "./llm-service.js";
import {
  renderResults,
  renderSchemaResults,
  renderSchemaOverview,
  renderColumnDescriptions,
  renderRelationships,
  renderJoinsAndModeling,
  renderChatMessage,
  showDbtRuleLoadingIndicator,
} from "./ui.js";
import { exportToZip } from "./export-service.js";
import { exportDbtLocalZip } from "./dbt-local-service.js";
import { unsafeHTML } from "lit-html/directives/unsafe-html";
import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";

// Initialize Marked for markdown parsing
const marked = new Marked();

let fileData = null;
let schemaData = null;
let dbtRulesData = null;
let llmConfig = null;
let chatAttachedFile = null;

/**
 * Get the currently selected model
 * @returns {String} Selected model name
 */
function getSelectedModel() {
  const savedModel = localStorage.getItem('selectedModel');
  const selectElement = document.getElementById("model-select");
  return selectElement ? selectElement.value : (savedModel || 'gpt-4.1-mini');
}

// Initialize the application
async function init() {
  setupEventListeners();
  await initLlmConfig();
  loadPromptsIntoTextareas();
}

function setupEventListeners() {
  // Main form elements
  const uploadForm = document.getElementById("upload-form");
  if (uploadForm) {
    uploadForm.addEventListener("submit", handleFileUpload);
  }
  
  const exportBtn = document.getElementById("export-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", handleExport);
  }
  
  const runDbtLocallyBtn = document.getElementById("run-dbt-locally-btn");
  if (runDbtLocallyBtn) {
    runDbtLocallyBtn.addEventListener("click", handleRunDbtLocally);
  }
  
  const configureLlmBtn = document.getElementById("configure-llm-btn");
  if (configureLlmBtn) {
    configureLlmBtn.addEventListener("click", handleConfigureLlm);
  }
  
  const generateDbtBtn = document.getElementById("generate-dbt-btn");
  if (generateDbtBtn) {
    generateDbtBtn.addEventListener("click", handleGenerateDbtRules);
  }

  // Advanced settings event listeners
  const savePromptsBtn = document.getElementById("save-prompts-btn");
  if (savePromptsBtn) {
    savePromptsBtn.addEventListener("click", handleSavePrompts);
  }
  
  const resetPromptsBtn = document.getElementById("reset-prompts-btn");
  if (resetPromptsBtn) {
    resetPromptsBtn.addEventListener("click", handleResetPrompts);
  }
  
  // Floating chat button listeners
  const chatFloatBtn = document.getElementById("chat-float-btn");
  if (chatFloatBtn) {
    chatFloatBtn.addEventListener("click", toggleFloatingChat);
  }
  
  const closeChatBtn = document.getElementById("close-chat-btn");
  if (closeChatBtn) {
    closeChatBtn.addEventListener("click", toggleFloatingChat);
  }
  
  const resetChatBtnFloating = document.getElementById("reset-chat-btn-floating");
  if (resetChatBtnFloating) {
    resetChatBtnFloating.addEventListener("click", handleResetChat);
  }
  
  const chatFormFloating = document.getElementById("chat-form-floating");
  if (chatFormFloating) {
    chatFormFloating.addEventListener("submit", handleChatSubmit);
  }

  // Chat file attachment listeners
  setupChatFileListeners();
  
  // Sample datasets button listener
  const sampleDatasetsBtn = document.getElementById("sample-datasets-btn");
  if (sampleDatasetsBtn) {
    sampleDatasetsBtn.addEventListener("click", () => {
      const container = document.getElementById('sample-datasets-container');
      if (container && container.querySelectorAll('.sample-dataset-card').length === 0) {
        loadSampleDatasets();
      }
    });
  }
}

/**
 * Load current prompts into the textareas
 */
function loadPromptsIntoTextareas() {
  const prompts = getCurrentPrompts();
  document.getElementById("schema-prompt").value = prompts.schema;
  document.getElementById("dbt-prompt").value = prompts.dbtRules;
  
  // Load saved model selection or default to gpt-4.1-mini
  const savedModel = localStorage.getItem('selectedModel') || 'gpt-4.1-mini';
  document.getElementById("model-select").value = savedModel;
}

/**
 * Handle saving custom prompts
 */
function handleSavePrompts() {
  const schemaPrompt = document.getElementById("schema-prompt").value.trim();
  const dbtPrompt = document.getElementById("dbt-prompt").value.trim();
  const selectedModel = document.getElementById("model-select").value;

  if (!schemaPrompt || !dbtPrompt) {
    updateStatus("Please fill in both prompts before saving", "warning");
    return;
  }

  setCustomPrompts({
    schema: schemaPrompt,
    dbtRules: dbtPrompt,
  });

  // Save selected model to localStorage
  localStorage.setItem('selectedModel', selectedModel);

  updateStatus("Custom prompts and model selection saved successfully", "success");
}

/**
 * Handle resetting prompts to default
 */
function handleResetPrompts() {
  resetPrompts();
  loadPromptsIntoTextareas();
  // Reset model selection to default
  document.getElementById("model-select").value = 'gpt-4.1-mini';
  localStorage.setItem('selectedModel', 'gpt-4.1-mini');
  updateStatus("Prompts and model selection reset to default", "info");
}

/**
 * Handle resetting chat history
 */
function handleResetChat() {
  resetChatHistory();
  clearChatFile();
  
  const chatMessagesFloating = document.getElementById("chat-messages-floating");
  if (chatMessagesFloating) render(html``, chatMessagesFloating);
  
  updateStatus("Chat history has been reset", "info");
}

/**
 * Setup chat file attachment listeners
 */
function setupChatFileListeners() {
  const elements = {
    attachBtn: document.getElementById("chat-attach-btn"),
    fileInput: document.getElementById("chat-file-input"),
    dropZone: document.getElementById("chat-drop-zone"),
    fileRemove: document.getElementById("chat-file-remove")
  };

  elements.attachBtn?.addEventListener("click", () => elements.fileInput.click());
  elements.fileInput?.addEventListener("change", (e) => e.target.files[0] && handleChatFileSelect(e.target.files[0]));
  elements.fileRemove?.addEventListener("click", clearChatFile);

  // Drag and drop with consolidated handler
  elements.dropZone?.addEventListener("dragover", handleDragOver);
  elements.dropZone?.addEventListener("dragleave", handleDragLeave);
  elements.dropZone?.addEventListener("drop", handleDrop);
}

function handleDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add("border-primary");
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove("border-primary");
}

function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove("border-primary");
  e.dataTransfer.files[0] && handleChatFileSelect(e.dataTransfer.files[0]);
}

function handleChatFileSelect(file) {
  chatAttachedFile = file;
  document.getElementById("chat-file-name").textContent = file.name;
  document.getElementById("chat-file-preview").classList.remove("d-none");
}

function clearChatFile() {
  chatAttachedFile = null;
  document.getElementById("chat-file-preview").classList.add("d-none");
  document.getElementById("chat-file-input").value = '';
}



/**
 * Load sample datasets from config and render them as cards
 */
async function loadSampleDatasets() {
  const response = await fetch('./config.json');
  const config = await response.json();
  const container = document.getElementById('sample-datasets-container');
  const datasets = config.demos || [];
  
  // Create cards for each dataset
  const cardsTemplate = html`${datasets.map(dataset => html`
    <div class="col-md-6 col-lg-4 mb-3">
      <div class="card h-100 sample-dataset-card" data-url="${dataset.href}" data-title="${dataset.title}" style="cursor: pointer; transition: transform 0.2s;">
        <div class="card-body">
          <h5 class="card-title">${dataset.title}</h5>
          <p class="card-text text-muted">${dataset.body}</p>
        </div>
      </div>
    </div>
  `)}`;
  
  render(cardsTemplate, container);
  
  // Add click event listeners to the cards
  const cards = container.querySelectorAll('.sample-dataset-card');
  cards.forEach(card => {
    card.addEventListener('click', handleSampleDatasetClick);
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-2px)';
      card.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'translateY(0)';
      card.style.boxShadow = 'none';
    });
  });
}

/**
 * Handle sample dataset card click
 */
async function handleSampleDatasetClick(event) {
  const card = event.currentTarget;
  const url = card.dataset.url;
  const title = card.dataset.title;
  
  if (!url || !llmConfig) {
    updateStatus("Please configure LLM settings first", "warning");
    return;
  }
  
  card.style.opacity = '0.6';
  card.style.pointerEvents = 'none';
  setLoading("upload", true);
  updateStatus(`Loading ${title}...`, "info");
  
  try {
    fileData = await parseFileFromUrl(url, title);
    document.getElementById("results-container").classList.remove("d-none");
    
    schemaData = {
      schemas: [],
      relationships: [],
      suggestedJoins: [],
      modelingRecommendations: [],
    };
    
    renderSchemaResults(schemaData);
    updateStatus("Generating schema...", "info");
    
    schemaData = await generateSchema(fileData, llmConfig, (partialData) => {
      if (partialData) {
        if (!partialData.relationships) partialData.relationships = [];
        renderSchemaOverview(partialData);
        renderColumnDescriptions(partialData);
        renderRelationships(partialData);
        renderJoinsAndModeling(partialData);
      }
    }, getSelectedModel());
    
    if (!schemaData.relationships) schemaData.relationships = [];
    renderSchemaResults(schemaData);
    document.getElementById("generate-dbt-btn").classList.remove("d-none");
    updateStatus(`Schema generation complete for ${title}!`, "success");
  } catch (error) {
    updateStatus(`Error loading ${title}: ${error.message}`, "danger");
  } finally {
    setLoading("upload", false);
    card.style.opacity = '1';
    card.style.pointerEvents = 'auto';
  }
}

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

async function handleConfigureLlm() {
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

function updateLlmConfigStatus(message, type = "info") {
  const configContainer = document.getElementById("llm-config-container");
  const existingText = configContainer.querySelector(".text-muted");

  // Update status but keep the configure button
  const statusTemplate = html`
    <div class="alert alert-${type} mt-2">${message}</div>
  `;

  // Remove existing status alerts
  const existingAlerts = configContainer.querySelectorAll(".alert");
  existingAlerts.forEach((alert) => alert.remove());

  // Add new status
  const tempContainer = document.createElement("div");
  render(statusTemplate, tempContainer);

  if (existingText) {
    existingText.insertAdjacentElement(
      "afterend",
      tempContainer.firstElementChild
    );
  } else {
    configContainer.appendChild(tempContainer.firstElementChild);
  }

  // Clear success/info messages after 5 seconds
  if (type === "success" || type === "info") {
    setTimeout(() => {
      const currentAlert = configContainer.querySelector(`.alert-${type}`);
      if (currentAlert && currentAlert.textContent.trim() === message) {
        currentAlert.remove();
      }
    }, 5000);
  }
}

async function handleFileUpload(event) {
  event.preventDefault();

  const fileInput = document.getElementById("file-input");
  const file = fileInput.files[0];

  if (!file) {
    updateStatus("Please select a file to upload", "warning");
    return;
  }

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

async function handleGenerateDbtRules() {
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

function handleExport() {
  if (!schemaData) {
    updateStatus("No data available to export", "warning");
    return;
  }
  
  exportToZip(schemaData, dbtRulesData, updateStatus, fileData);
}

/**
 * Handle run DBT locally button click
 */
function handleRunDbtLocally() {
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
 * Toggle the floating chat visibility
 */
function toggleFloatingChat() {
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
async function handleChatSubmit(event) {
  event.preventDefault();

  const chatInput = document.getElementById("chat-input-floating");
  const userMessage = chatInput.value.trim();

  if (!userMessage || !llmConfig) return;

  let attachmentData = null;
  let displayMessage = userMessage;

  // Process attached file if exists
  if (chatAttachedFile) {
    try {
      attachmentData = await parseFile(chatAttachedFile);
      displayMessage += ` [Attached: ${chatAttachedFile.name}]`;
    } catch (error) {
      renderChatMessage("system", `Error reading file: ${error.message}`);
      return;
    }
  }

  // Add user message to chat
  renderChatMessage("user", displayMessage);
  chatInput.value = "";

  // Clear attachment after sending
  if (chatAttachedFile) clearChatFile();

  setLoading("chat-floating", true);

  try {
    // Prepare context for the LLM
    const context = {
      fileData: fileData || attachmentData,
      schema: schemaData,
      dbtRules: dbtRulesData,
      attachedFile: attachmentData
    };

    // Create a placeholder for the assistant's response
    const assistantPlaceholder = document.createElement("div");
    document.getElementById("chat-messages-floating").appendChild(assistantPlaceholder);

    // Stream the chat response - the LLM will determine if this is a DBT rule modification
    const finalResponse = await streamChatResponse(
      context,
      userMessage,
      llmConfig,
      (partialContent) => {
        // If this is a loading message for DBT rules, show a special loading indicator
        if (partialContent === "Generating DBT rule modifications...") {
          // Remove the placeholder
          assistantPlaceholder.remove();
          // Show the DBT rule loading indicator
          showDbtRuleLoadingIndicator(true);
        } else {
          // Regular message update
          render(
            html`
              <div class="card mb-2">
                <div class="card-body">
                  <p class="card-text">
                    ${formatChatMessageWithMarked(partialContent)}
                  </p>
                </div>
              </div>
            `,
            assistantPlaceholder
          );

          // Scroll to bottom as content streams in
          const chatContainer = document.getElementById("chat-messages-floating");
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }
      },
      getSelectedModel()
    );

    // Remove the placeholder if it still exists (it might have been removed already for DBT rule requests)
    if (assistantPlaceholder.parentNode) {
      assistantPlaceholder.remove();
    }
    
    // Hide the DBT rule loading indicator if it was shown
    showDbtRuleLoadingIndicator(false);

    // Check if the response contains updated DBT rules
    const updatedRulesMatch = finalResponse.match(/<!-- UPDATED_DBT_RULES:(.+?) -->/s);
    if (updatedRulesMatch) {
      try {
        // Extract the updated rules JSON
        const updatedRulesJson = updatedRulesMatch[1];
        const updatedRules = JSON.parse(updatedRulesJson);
        
        // Update the global dbtRulesData
        dbtRulesData = updatedRules;
        
        // Re-render the DBT rules UI with the updated rules
        renderResults(schemaData, dbtRulesData);
        
        // Remove the JSON and metadata from the displayed message
        let cleanResponse = finalResponse
          .replace(/<!-- UPDATED_DBT_RULES:.+? -->/s, '')
          .replace(/<!-- LAST_MODIFIED_TABLE:.+? -->/s, '');
        renderChatMessage("assistant", cleanResponse, true);
        
        // Always show the DBT tab when rules are modified or added
        // This makes changes immediately visible to the user
        if (cleanResponse.includes('DBT Rules Updated')) {
          handleDbtRuleUpdate(finalResponse, cleanResponse);
        }
      } catch (error) {
        console.error("Error processing updated DBT rules:", error);
        renderChatMessage("assistant", finalResponse, true);
      }
    } else {
      // Regular response without DBT rule updates
      renderChatMessage("assistant", finalResponse, true);
    }
  } catch (error) {
    updateStatus(`Chat error: ${error.message}`, "danger");
    renderChatMessage("system", `Error: ${error.message}`);
  } finally {
    setLoading("chat-floating", false);
  }
}

/**
 * Format chat message content with Marked markdown parser
 * @param {String} message - Raw message content
 * @returns {TemplateResult} Formatted message template
 */
function formatChatMessageWithMarked(message) {
  if (!message) return "";

  // Use Marked to parse markdown
  const parsedMarkdown = marked.parse(message);

  // Return as unsafe HTML since it's been parsed by Marked
  return unsafeHTML(parsedMarkdown);
}

function updateStatus(message, type = "info") {
  const statusContainer = document.getElementById("status-container");
  const statusTemplate = html`
    <div class="alert alert-${type} mt-3">${message}</div>
  `;

  render(statusTemplate, statusContainer);

  // Clear success/info messages after 5 seconds
  if (type === "success" || type === "info") {
    setTimeout(() => {
      const currentAlert = statusContainer.querySelector(`.alert-${type}`);
      if (currentAlert && currentAlert.textContent.trim() === message) {
        render(html``, statusContainer);
      }
    }, 5000);
  }
}

function setLoading(action, isLoading) {
  const spinnerId = action === "chat-floating" ? "chat-spinner-floating" : `${action}-spinner`;
  const spinner = document.getElementById(spinnerId);
  const button = spinner?.closest("button");

  if (spinner && button) {
    spinner.classList.toggle("d-none", !isLoading);
    button.disabled = isLoading;
  }
}

/**
 * Handle DBT rule updates - scroll to the updated rule and activate the DBT tab
 * @param {String} fullResponse - The full LLM response including metadata
 * @param {String} cleanResponse - The cleaned response without metadata
 */
function handleDbtRuleUpdate(fullResponse, cleanResponse) {
  // Activate the DBT tab to show the changes
  const tabButton = document.querySelector('[data-bs-target="#dbt-tab"]');
  if (tabButton && typeof tabButton.click === 'function') {
    tabButton.click();
    
    // Scroll the window to show the newly added/modified rule
    setTimeout(() => {
      // Extract the table name from the hidden marker if present
      const tableMatch = fullResponse.match(/<!-- LAST_MODIFIED_TABLE:([^\s]+) -->/s);
      let tableName = tableMatch ? tableMatch[1] : null;
      let targetElement = null;
      
      // If we have a specific table name, try to find its card
      if (tableName) {
        // Look for the exact card with this table name
        const tableCards = Array.from(document.querySelectorAll('.card-header h5'));
        for (const card of tableCards) {
          if (card.textContent.includes(tableName)) {
            targetElement = card.closest('.card');
            break;
          }
        }
      }
      
      // If we couldn't find the specific card, try extracting from the response text
      if (!targetElement) {
        const match = cleanResponse.match(/(?:Added new rule|Modified rule) for table ['']([^']+)['']/);
        if (match && match[1]) {
          tableName = match[1];
          // Look for the card with this table name
          const tableCards = Array.from(document.querySelectorAll('.card-header h5'));
          for (const card of tableCards) {
            if (card.textContent.includes(tableName)) {
              targetElement = card.closest('.card');
              break;
            }
          }
        }
      }
      
      // If we still couldn't find the specific card, fall back to scrolling to the content area
      if (!targetElement) {
        targetElement = document.getElementById('dbt-content');
      }
      
      if (targetElement) {
        // Scroll to the target element and position it in the center of the viewport
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }
}

/**
 * Expand all collapsible cards with IDs containing the specified prefix
 * @param {string} prefix - The prefix to match in card IDs (e.g., 'schema-collapse', 'column-collapse')
 */
function expandAllCards(prefix) {
  // Find all collapse elements that match the prefix
  const collapseElements = document.querySelectorAll(`[id^="${prefix}"]`);
  
  collapseElements.forEach(collapseElement => {
    // Check if the element is collapsed
    if (collapseElement.classList.contains('collapse') && !collapseElement.classList.contains('show')) {
      // Create a Bootstrap collapse instance and show it
      const bsCollapse = new bootstrap.Collapse(collapseElement, {
        toggle: false
      });
      bsCollapse.show();
      
      // Update the associated button's aria-expanded attribute
      const triggerButton = document.querySelector(`[data-bs-target="#${collapseElement.id}"]`);
      if (triggerButton) {
        triggerButton.setAttribute('aria-expanded', 'true');
      }
    }
  });
}

// Make functions globally available
window.expandAllCards = expandAllCards;
window.getSelectedModel = getSelectedModel;

// Initialize the application
document.addEventListener("DOMContentLoaded", init);
