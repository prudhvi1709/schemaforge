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
import { renderDataIngestion } from "./data-ingestion.js";
import { exportDbtLocalZip } from "./dbt-local-service.js";
import { unsafeHTML } from "lit-html/directives/unsafe-html";
import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";

const marked = new Marked();
let fileData = null, schemaData = null, dbtRulesData = null, llmConfig = null, chatAttachedFile = null;

const getSelectedModel = () => document.getElementById("model-select")?.value || localStorage.getItem('selectedModel') || 'gpt-4.1-mini';
const getLLMConfig = () => llmConfig;

window.currentFileData = null;

const init = async () => {
  setupEventListeners();
  await initLlmConfig();
  loadPromptsIntoTextareas();
};

const setupEventListeners = () => {
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
    document.getElementById(id)?.addEventListener(event, handler);
  });
  setupChatFileListeners();
};

const setupChatFileListeners = () => {
  const attachBtn = document.getElementById("chat-attach-btn");
  const fileInput = document.getElementById("chat-file-input");
  const dropZone = document.getElementById("chat-drop-zone");
  const fileRemove = document.getElementById("chat-file-remove");

  attachBtn?.addEventListener("click", () => fileInput.click());
  fileInput?.addEventListener("change", (e) => e.target.files[0] && handleChatFileSelect(e.target.files[0]));
  fileRemove?.addEventListener("click", clearChatFile);

  dropZone?.addEventListener("dragover", (e) => { e.preventDefault(); e.currentTarget.classList.add("border-primary"); });
  dropZone?.addEventListener("dragleave", (e) => e.currentTarget.classList.remove("border-primary"));
  dropZone?.addEventListener("drop", (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove("border-primary");
    e.dataTransfer.files[0] && handleChatFileSelect(e.dataTransfer.files[0]);
  });
};

const handleChatFileSelect = (file) => {
  chatAttachedFile = file;
  document.getElementById("chat-file-name").textContent = file.name;
  document.getElementById("chat-file-preview").classList.remove("d-none");
};

const clearChatFile = () => {
  chatAttachedFile = null;
  document.getElementById("chat-file-preview").classList.add("d-none");
  document.getElementById("chat-file-input").value = '';
};

const loadPromptsIntoTextareas = () => {
  const prompts = getCurrentPrompts();
  document.getElementById("schema-prompt").value = prompts.schema;
  document.getElementById("dbt-prompt").value = prompts.dbtRules;
  document.getElementById("model-select").value = localStorage.getItem('selectedModel') || 'gpt-4.1-mini';
};

const handleSavePrompts = () => {
  const schemaPrompt = document.getElementById("schema-prompt").value.trim();
  const dbtPrompt = document.getElementById("dbt-prompt").value.trim();
  const selectedModel = document.getElementById("model-select").value;
  
  if (!schemaPrompt || !dbtPrompt) return updateStatus("Please fill in both prompts before saving", "warning");
  
  setCustomPrompts({ schema: schemaPrompt, dbtRules: dbtPrompt });
  localStorage.setItem('selectedModel', selectedModel);
  updateStatus("Custom prompts and model selection saved successfully", "success");
};

const handleResetPrompts = () => {
  resetPrompts();
  loadPromptsIntoTextareas();
  document.getElementById("model-select").value = 'gpt-4.1-mini';
  localStorage.setItem('selectedModel', 'gpt-4.1-mini');
  updateStatus("Prompts and model selection reset to default", "info");
};

const handleResetChat = () => {
  resetChatHistory();
  clearChatFile();
  render(html``, document.getElementById("chat-messages-floating"));
  updateStatus("Chat history has been reset", "info");
};

const handleSampleDatasetsClick = () => {
  const container = document.getElementById('sample-datasets-container');
  if (container?.querySelectorAll('.sample-dataset-card').length === 0) {
    loadSampleDatasets();
  }
};

const loadSampleDatasets = async () => {
  const config = await (await fetch('./config.json')).json();
  const container = document.getElementById('sample-datasets-container');
  render(html`${(config.demos || []).map(dataset => html`
    <div class="col-md-6 mb-3">
      <div class="card sample-dataset-card" data-url="${dataset.href}" data-title="${dataset.title}" style="cursor: pointer;">
        <div class="card-body"><h5>${dataset.title}</h5><p class="text-muted">${dataset.body}</p></div>
      </div>
    </div>`)}`, container);
  container.querySelectorAll('.sample-dataset-card').forEach(card => card.addEventListener('click', handleSampleDatasetClick));
};

const handleSampleDatasetClick = async (event) => {
  const { url, title } = event.currentTarget.dataset;
  if (!url || !llmConfig) return updateStatus("Configure LLM first", "warning");
  
  setLoading("upload", true);
  updateStatus(`Loading ${title}...`, "info");
  try { await processFile(await parseFileFromUrl(url, title), title); }
  catch (error) { updateStatus(`Error: ${error.message}`, "danger"); }
  finally { setLoading("upload", false); }
};

const getGlobalTableRules = () => document.getElementById('table-classification-rules')?.value.trim() || '';


const processFile = async (data, name = null) => {
  fileData = data;
  window.currentFileData = fileData;
  document.getElementById("results-container").classList.remove("d-none");
  
  schemaData = { schemas: [], relationships: [], suggestedJoins: [], modelingRecommendations: [] };
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
  }, getSelectedModel(), getGlobalTableRules());
  
  if (!schemaData.relationships) schemaData.relationships = [];
  renderSchemaResults(schemaData);
  window.currentSchemaData = schemaData;
  renderDataIngestion(schemaData);
  document.getElementById("generate-dbt-btn").classList.remove("d-none");
  updateStatus(`Schema complete${name ? ` for ${name}` : ''}!`, "success");
};

const llmConfigOptions = {
  defaultBaseUrls: ["https://api.openai.com/v1", "https://openrouter.com/api/v1", "http://localhost:11434/v1"],
  help: '<div class="alert alert-info">This app requires an LLM API to generate DBT rules from your data files. You can use OpenAI, OpenRouter, Ollama, or any OpenAI-compatible API.</div>',
  title: "LLM Provider Configuration",
  buttonLabel: "Save Configuration",
  show: false,
};

const initLlmConfig = async () => {
  try {
    llmConfig = await openaiConfig(llmConfigOptions);
    updateLlmConfigStatus("LLM configuration loaded successfully", "success");
  } catch (error) {
    updateLlmConfigStatus("Click 'Configure LLM Provider' to set up your API provider", "info");
  }
};

const handleConfigureLlm = async () => {
  try {
    updateLlmConfigStatus("Opening configuration modal...", "info");
    llmConfig = await openaiConfig({ ...llmConfigOptions, show: true });
    updateLlmConfigStatus("LLM configuration successful", "success");
  } catch (error) {
    updateLlmConfigStatus(`Failed to configure LLM: ${error.message}`, "danger");
  }
};

const updateLlmConfigStatus = (message, type = "info") => {
  const configContainer = document.getElementById("llm-config-container");
  configContainer.querySelectorAll(".alert").forEach(alert => alert.remove());
  const tempContainer = document.createElement("div");
  render(html`<div class="alert alert-${type} mt-2">${message}</div>`, tempContainer);
  (configContainer.querySelector(".text-muted") || configContainer).appendChild(tempContainer.firstElementChild);
  if (type === "success" || type === "info") setTimeout(() => configContainer.querySelector(`.alert-${type}`)?.remove(), 5000);
};

const handleFileUpload = async (event) => {
  event.preventDefault();
  const file = document.getElementById("file-input").files[0];
  if (!file) return updateStatus("Select a file", "warning");
  if (!llmConfig) return updateStatus("Configure LLM first", "warning");
  
  setLoading("upload", true);
  updateStatus("Processing...", "info");
  try {
    await processFile(await parseFile(file));
    updateStatus("Complete! Generate DBT Rules next.", "success");
  } catch (error) { updateStatus(`Error: ${error.message}`, "danger"); }
  finally { setLoading("upload", false); }
};

const handleGenerateDbtRules = async () => {
  if (!schemaData || !llmConfig) return updateStatus("Upload file and generate schema first", "warning");
  
  setLoading("generate-dbt", true);
  updateStatus("Generating DBT rules...", "info");
  try {
    dbtRulesData = { dbtRules: [], globalRecommendations: [] };
    renderResults(schemaData, dbtRulesData);
    dbtRulesData = await generateDbtRules(schemaData, llmConfig, (partialData) => {
      if (partialData) renderResults(schemaData, partialData);
    }, getSelectedModel());
    window.currentDbtRulesData = dbtRulesData;
    document.getElementById("chat-float-btn").classList.remove("d-none");
    document.getElementById("generate-dbt-btn").classList.add("d-none");
    updateStatus("DBT rules complete!", "success");
  } catch (error) { updateStatus(`Error: ${error.message}`, "danger"); }
  finally { setLoading("generate-dbt", false); }
};

const handleRunDbtLocally = () => {
  if (!schemaData) return updateStatus("No data to export", "warning");
  if (!dbtRulesData?.dbtRules) return updateStatus("Generate DBT rules first", "warning");
  if (!fileData?._originalFileContent) return updateStatus("Upload file first", "warning");
  exportDbtLocalZip(schemaData, dbtRulesData, updateStatus, fileData);
};

const toggleFloatingChat = () => {
  const chat = document.getElementById("chat-container-floating");
  const isHidden = chat.classList.contains("d-none");
  chat.classList.toggle("d-none", !isHidden);
  chat.classList.toggle("d-block", isHidden);
  if (isHidden) document.getElementById("chat-input-floating").focus();
};

const handleChatSubmit = async (event) => {
  event.preventDefault();
  const chatInput = document.getElementById("chat-input-floating");
  const userMessage = chatInput.value.trim();
  if (!userMessage || !llmConfig) return;
  
  let attachmentData = null, displayMessage = userMessage;
  if (chatAttachedFile) {
    try {
      attachmentData = await parseFile(chatAttachedFile);
      displayMessage += ` [Attached: ${chatAttachedFile.name}]`;
    } catch (error) { return renderChatMessage("system", `Error: ${error.message}`); }
  }
  
  renderChatMessage("user", displayMessage);
  chatInput.value = "";
  if (chatAttachedFile) clearChatFile();
  setLoading("chat-floating", true);
  
  try {
    const context = { fileData: fileData || attachmentData, schema: schemaData, dbtRules: dbtRulesData, attachedFile: attachmentData };
    const placeholder = document.createElement("div");
    document.getElementById("chat-messages-floating").appendChild(placeholder);
    
    const response = await streamChatResponse(context, userMessage, llmConfig, (partial) => {
      if (partial === "Generating DBT rule modifications...") {
        placeholder.remove();
        showDbtRuleLoadingIndicator(true);
      } else {
        render(html`<div class="card mb-2"><div class="card-body"><p class="card-text">${formatChatMessageWithMarked(partial)}</p></div></div>`, placeholder);
        document.getElementById("chat-messages-floating").scrollTop = document.getElementById("chat-messages-floating").scrollHeight;
      }
    }, getSelectedModel());
    
    if (placeholder.parentNode) placeholder.remove();
    showDbtRuleLoadingIndicator(false);
    
    const rulesMatch = response.match(/<!-- UPDATED_DBT_RULES:(.+?) -->/s);
    if (rulesMatch) {
      try {
        dbtRulesData = JSON.parse(rulesMatch[1]);
        renderResults(schemaData, dbtRulesData);
        const clean = response.replace(/<!-- UPDATED_DBT_RULES:.+? -->/s, '').replace(/<!-- LAST_MODIFIED_TABLE:.+? -->/s, '');
        renderChatMessage("assistant", clean, true);
        if (clean.includes('DBT Rules Updated')) handleDbtRuleUpdate(response, clean);
      } catch { renderChatMessage("assistant", response, true); }
    } else { renderChatMessage("assistant", response, true); }
  } catch (error) {
    updateStatus(`Chat error: ${error.message}`, "danger");
    renderChatMessage("system", `Error: ${error.message}`);
  } finally { setLoading("chat-floating", false); }
};

const formatChatMessageWithMarked = (message) => message ? unsafeHTML(marked.parse(message)) : "";

const updateStatus = (message, type = "info") => {
  const container = document.getElementById("status-container");
  render(html`<div class="alert alert-${type} mt-3">${message}</div>`, container);
  if (type === "success" || type === "info") setTimeout(() => {
    const alert = container.querySelector(`.alert-${type}`);
    if (alert?.textContent.trim() === message) render(html``, container);
  }, 5000);
};

const setLoading = (action, isLoading) => {
  const spinner = document.getElementById(action === "chat-floating" ? "chat-spinner-floating" : `${action}-spinner`);
  const button = spinner?.closest("button");
  if (spinner && button) {
    spinner.classList.toggle("d-none", !isLoading);
    button.disabled = isLoading;
  }
};

const handleDbtRuleUpdate = (fullResponse, cleanResponse) => {
  const tab = document.querySelector('[data-bs-target="#dbt-tab"]');
  if (!tab?.click) return;
  tab.click();
  setTimeout(() => {
    const tableName = fullResponse.match(/<!-- LAST_MODIFIED_TABLE:([^\s]+) -->/s)?.[1] || cleanResponse.match(/for table ['']([^']+)['']]/)?.[1];
    const target = tableName ? Array.from(document.querySelectorAll('.card-header h5')).find(h => h.textContent.includes(tableName))?.closest('.card') : null;
    (target || document.getElementById('dbt-content'))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);
};

const expandAllCards = (prefix) => {
  document.querySelectorAll(`[id^="${prefix}"]`).forEach(el => {
    if (el.classList.contains('collapse') && !el.classList.contains('show')) {
      new bootstrap.Collapse(el, { toggle: false }).show();
      document.querySelector(`[data-bs-target="#${el.id}"]`)?.setAttribute('aria-expanded', 'true');
    }
  });
};

window.expandAllCards = expandAllCards;
window.getSelectedModel = getSelectedModel;
window.getLLMConfig = getLLMConfig;
window.handleRunDbtLocally = handleRunDbtLocally;

document.addEventListener("DOMContentLoaded", init);