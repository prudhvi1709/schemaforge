import { html, render } from 'lit-html';
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@2";
import { parse } from "https://cdn.jsdelivr.net/npm/partial-json@0.1.7/+esm";

const SUPPORTED_SOURCES = [
  { value: 'csv', label: 'CSV File' },
  { value: 'excel', label: 'Excel File' },
  { value: 'sqlite3', label: 'SQLite Database' },
  { value: 'parquet', label: 'Parquet File' },
  { value: 'json', label: 'JSON File' }
];

const SUPPORTED_DESTINATIONS = [
  { value: 'csv', label: 'CSV File' },
  { value: 'excel', label: 'Excel File' },
  { value: 'sqlite3', label: 'SQLite Database' },
  { value: 'parquet', label: 'Parquet File' },
  { value: 'json', label: 'JSON File' }
];

let generatedFiles = {
  sourceScript: null,
  destScript: null
};
/**
 * Shows a status message in the UI.
 * @param {string} message - The message to display.
 * @param {string} type - The alert type (e.g., 'success', 'danger', 'info').
 * @param {number} [duration=0] - Duration in ms to show the message. 0 for permanent.
 */
function showStatus(message, type = 'info', duration = 0) {
  const statusDiv = document.getElementById('conversion-status');
  if (!statusDiv) return;

  const alertClass = `alert alert-${type}`;
  const statusTemplate = html`<div class="${alertClass}">${message}</div>`;
  render(statusTemplate, statusDiv);

  if (duration > 0) {
    setTimeout(() => {
      render(html``, statusDiv);
    }, duration);
  }
}

/**
 * Render the data ingestion interface
 * @param {Object} schemaData - Schema data for context
 */
export function renderDataIngestion(schemaData) {
  const ingestionContent = document.getElementById("ingestion-content");
  if (!ingestionContent) {
    console.warn("Ingestion content element not found");
    return;
  }

  const ingestionTemplate = html`
    <div class="card">
      <div class="card-header"><h5 class="mb-0">Data Ingestion Configuration</h5></div>
      <div class="card-body">
        <div class="row">
          <div class="col-md-6 mb-3">
            <label for="source-type" class="form-label">Source Format</label>
            <select class="form-select" id="source-type">
              <option value="">Select source format...</option>
              ${SUPPORTED_SOURCES.map(s => html`<option value="${s.value}">${s.label}</option>`)}
            </select>
          </div>
          <div class="col-md-6 mb-3">
            <label for="dest-type" class="form-label">Destination Format</label>
            <select class="form-select" id="dest-type">
              <option value="">Select destination format...</option>
              ${SUPPORTED_DESTINATIONS.map(d => html`<option value="${d.value}">${d.label}</option>`)}
            </select>
          </div>
        </div>
        <div class="mb-3">
          <label for="conversion-params" class="form-label">Conversion Parameters (Optional)</label>
          <textarea class="form-control" id="conversion-params" rows="3" placeholder="Enter any specific conversion parameters..."></textarea>
          <div class="form-text">Examples: Filter columns, date range, data type conversions.</div>
        </div>
        <div class="d-flex gap-2 mb-3">
          <button type="button" class="btn btn-primary" @click=${() => handleGenerateConversion(schemaData)}>
            <span class="spinner-border spinner-border-sm d-none" id="generate-conversion-spinner"></span>
            Generate Conversion Scripts
          </button>
        </div>
        <div id="conversion-status"></div>
      </div>
    </div>
    <div class="mt-4" id="generated-scripts-section" style="display: none;"></div>
  `;
  render(ingestionTemplate, ingestionContent);
}

/**
 * Handle conversion script generation.
 * @param {Object} schemaData - Schema data for context.
 */
async function handleGenerateConversion(schemaData) {
  const sourceType = document.getElementById('source-type').value;
  const destType = document.getElementById('dest-type').value;
  const conversionParams = document.getElementById('conversion-params').value;

  if (!sourceType || !destType) {
    showStatus('Please select both source and destination formats.', 'warning');
    return;
  }

  showStatus('Generating conversion scripts...', 'info');

  try {
    const llmConfig = window.getLLMConfig?.();
    if (!llmConfig) {
      showStatus("Please configure LLM settings first by clicking 'Configure LLM Provider' in the upload section.", 'warning');
      return;
    }

    const conversionData = await generateConversionScripts(
      schemaData, sourceType, destType, conversionParams, llmConfig, updateConversionProgress
    );

    generatedFiles = conversionData;
    window.generatedConversionFiles = conversionData; // Make available globally
    
    showStatus('Conversion scripts generated successfully!', 'success', 3000);
  } catch (error) {
    console.error('Error generating conversion scripts:', error);
    showStatus(`Error: ${error.message}`, 'danger');
  }
}

/**
 * Generate conversion scripts using LLM with streaming.
 * @returns {Object} Generated scripts object.
 */
async function generateConversionScripts(schemaData, sourceType, destType, conversionParams, llmConfig, onUpdate) {
  try {
    const prompt = await createConversionPrompt(schemaData, sourceType, destType, conversionParams);
    
    const body = {
      model: window.getSelectedModel?.() || "gpt-4.1-mini",
      stream: true,
      messages: [
        { role: "system", content: "You are a Python expert specializing in data conversion scripts. Generate clean, efficient, and well-documented Python code." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    };

    let fullContent = "";
    for await (const { content, error } of asyncLLM(`${llmConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${llmConfig.apiKey}` },
      body: JSON.stringify(body),
    })) {
      if (error) throw new Error(`LLM API error: ${error}`);
      if (content) {
        fullContent = content;
        try {
          if (onUpdate) onUpdate(parse(fullContent));
        } catch (parseError) {
          // Ignore parse errors for partial content
        }
      }
    }
    return JSON.parse(fullContent);
  } catch (error) {
    throw new Error(`Conversion script generation failed: ${error.message}`);
  }
}

/**
 * Create prompt for conversion script generation.
 * @returns {Promise<String>} Formatted prompt.
 */
async function createConversionPrompt(schemaData, sourceType, destType, conversionParams) {
  const promptTemplate = await (await fetch('../prompts/data-ingestion-prompt.md')).text();

  const schemaInfo = (schemaData?.schemas || []).map(schema => ({
    tableName: schema.tableName,
    columns: schema.columns?.map(col => ({ name: col.name, dataType: col.dataType, isPII: col.isPII })) || []
  }));

  const replacements = {
    '{{sourceType}}': sourceType,
    '{{destType}}': destType,
    '{{conversionParams}}': conversionParams || 'None specified',
    '{{schemaInfo}}': JSON.stringify(schemaInfo, null, 2),
    '{{relationships}}': JSON.stringify(schemaData?.relationships || [], null, 2)
  };

  return Object.entries(replacements).reduce((prompt, [key, value]) => {
    return prompt.replace(new RegExp(key, 'g'), value);
  }, promptTemplate);
}

/**
 * Update conversion progress with streaming data.
 * @param {Object} partialData - Partial conversion data from streaming.
 */
function updateConversionProgress(partialData) {
  const scriptsSection = document.getElementById('generated-scripts-section');
  if (scriptsSection && partialData) {
    render(getScriptsTemplate(partialData), scriptsSection);
    scriptsSection.style.display = 'block';
  }

  let progressMessage = 'Generating conversion scripts...';
  if (partialData.sourceScript && partialData.destScript) {
    progressMessage = 'Finalizing both conversion scripts...';
  } else if (partialData.sourceScript) {
    progressMessage = 'Source script generated, working on destination script...';
  } else if (partialData.destScript) {
    progressMessage = 'Destination script generated, working on source script...';
  }
  showStatus(progressMessage, 'info');
}

/**
 * Get scripts template for rendering.
 * @param {Object} conversionData - Conversion data with scripts.
 * @returns {TemplateResult} Scripts template.
 */
function getScriptsTemplate(conversionData) {
  const sourceScript = conversionData.sourceScript || 'Generating source script...';
  const destScript = conversionData.destScript || 'Generating destination script...';
  const tabId = 'ingestion-scripts';
  const sourceTabId = `${tabId}-source`;
  const destTabId = `${tabId}-dest`;

  return html`
    <div class="card">
      <div class="card-header d-flex justify-content-between align-items-center">
        <h5 class="mb-0">Generated Conversion Scripts</h5>
        <button type="button" class="btn btn-success" @click=${handleExportWithConversionScripts}>Download Python Scripts</button>
      </div>
      <div class="card-body">
        <ul class="nav nav-tabs" id="${tabId}-tabs" role="tablist">
          <li class="nav-item" role="presentation">
            <button class="nav-link active" id="${sourceTabId}-tab" data-bs-toggle="tab" data-bs-target="#${sourceTabId}" type="button" role="tab" aria-controls="${sourceTabId}" aria-selected="true">Source Converter</button>
          </li>
          <li class="nav-item" role="presentation">
            <button class="nav-link" id="${destTabId}-tab" data-bs-toggle="tab" data-bs-target="#${destTabId}" type="button" role="tab" aria-controls="${destTabId}" aria-selected="false">Destination Converter</button>
          </li>
        </ul>
        <div class="tab-content mt-3" id="${tabId}-content">
          <div class="tab-pane fade show active" id="${sourceTabId}" role="tabpanel" aria-labelledby="${sourceTabId}-tab">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h6>convert_to_source.py</h6>
              <button class="btn btn-sm btn-outline-secondary" @click=${() => copyToClipboard(sourceTabId + '-content')}>Copy</button>
            </div>
            <pre><code id="${sourceTabId}-content">${sourceScript}</code></pre>
          </div>
          <div class="tab-pane fade" id="${destTabId}" role="tabpanel" aria-labelledby="${destTabId}-tab">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h6>convert_to_destination.py</h6>
              <button class="btn btn-sm btn-outline-secondary" @click=${() => copyToClipboard(destTabId + '-content')}>Copy</button>
            </div>
            <pre><code id="${destTabId}-content">${destScript}</code></pre>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Copy script content to clipboard.
 * @param {String} elementId - ID of element containing script content.
 */
function copyToClipboard(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    navigator.clipboard.writeText(element.textContent)
      .then(() => showStatus('Script copied to clipboard!', 'success', 2000))
      .catch(err => {
        console.error('Failed to copy to clipboard:', err);
        showStatus('Failed to copy to clipboard', 'danger', 3000);
      });
  }
}

/**
 * Handle export of conversion scripts as Python files.
 */
function handleExportWithConversionScripts() {
  if (!generatedFiles.sourceScript || !generatedFiles.destScript) {
    showStatus('Please generate conversion scripts first.', 'warning', 3000);
    return;
  }
  showStatus('Downloading Python scripts...', 'info');
  downloadFile('convert_to_source.py', generatedFiles.sourceScript);
  downloadFile('convert_to_destination.py', generatedFiles.destScript);
  setTimeout(() => showStatus('Python scripts downloaded successfully!', 'success', 3000), 500);
}

/**
 * Download a single file.
 * @param {String} filename - Name of the file.
 * @param {String} content - File content.
 */
function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}