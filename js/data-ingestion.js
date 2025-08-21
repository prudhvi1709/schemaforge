import { html, render } from 'lit-html';
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@2";
import { parse } from "https://cdn.jsdelivr.net/npm/partial-json@0.1.7/+esm";

const SUPPORTED_FORMATS = [
  { value: 'csv', label: 'CSV File' },
  { value: 'excel', label: 'Excel File' },
  { value: 'sqlite3', label: 'SQLite Database' },
  { value: 'parquet', label: 'Parquet File' },
  { value: 'json', label: 'JSON File' }
];

let generatedFiles = { sourceScript: null, destScript: null };

const createSelect = (id, label, placeholder) => html`
  <div class="col-md-6">
    <div class="mb-3">
      <label for="${id}" class="form-label">${label}</label>
      <select class="form-select" id="${id}">
        <option value="">${placeholder}</option>
        ${SUPPORTED_FORMATS.map(fmt => html`<option value="${fmt.value}">${fmt.label}</option>`)}
      </select>
    </div>
  </div>
`;

export function renderDataIngestion(schemaData) {
  const content = document.getElementById("ingestion-content");
  if (!content) return console.warn("Ingestion content element not found");

  render(html`
    <div class="card">
      <div class="card-header"><h5 class="mb-0">Data Ingestion Configuration</h5></div>
      <div class="card-body">
        <div class="row">
          ${createSelect("source-type", "Source Format", "Select source format...")}
          ${createSelect("dest-type", "Destination Format", "Select destination format...")}
        </div>
        <div class="mb-3">
          <label for="conversion-params" class="form-label">Conversion Parameters (Optional)</label>
          <textarea class="form-control" id="conversion-params" rows="3" 
            placeholder="Enter any specific conversion parameters, filters, or transformations needed..."></textarea>
          <div class="form-text">Examples: Filter specific columns, date range filtering, data type conversions, etc.</div>
        </div>
        <button type="button" class="btn btn-primary mb-3" @click=${() => handleGenerateConversion(schemaData)}>
          Generate Conversion Scripts
        </button>
        <div id="conversion-status"></div>
      </div>
    </div>
    <div class="mt-4" id="generated-scripts-section" style="display: none;"></div>
  `, content);
}

const showStatus = (message, type = 'info') => {
  const statusDiv = document.getElementById('conversion-status');
  render(html`<div class="alert alert-${type}">${message}</div>`, statusDiv);
};

async function handleGenerateConversion(schemaData) {
  const sourceType = document.getElementById('source-type').value;
  const destType = document.getElementById('dest-type').value;
  const conversionParams = document.getElementById('conversion-params').value;
  
  if (!sourceType || !destType) return showStatus('Please select both source and destination formats.', 'warning');
  
  showStatus(html`<div class="d-flex align-items-center">
    <div class="spinner-border spinner-border-sm me-2"><span class="visually-hidden">Loading...</span></div>
    Generating conversion scripts...
  </div>`);
  
  try {
    const llmConfig = window.getLLMConfig?.();
    if (!llmConfig) return showStatus('Please configure LLM settings first by clicking \'Configure LLM Provider\' in the upload section.', 'warning');
    
    const conversionData = await generateConversionScripts(schemaData, sourceType, destType, conversionParams, llmConfig, updateConversionProgress);
    
    generatedFiles = conversionData;
    window.generatedConversionFiles = conversionData;
    displayGeneratedScripts(conversionData);
    showStatus('Conversion scripts generated successfully!', 'success');
    
  } catch (error) {
    console.error('Error generating conversion scripts:', error);
    showStatus(`Error: ${error.message}`, 'danger');
  }
}

async function generateConversionScripts(schemaData, sourceType, destType, conversionParams, llmConfig, onUpdate) {
  const prompt = createConversionPrompt(schemaData, sourceType, destType, conversionParams);
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
  
  try {
    for await (const { content, error } of asyncLLM(`${llmConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${llmConfig.apiKey}` },
      body: JSON.stringify(body),
    })) {
      if (error) throw new Error(`LLM API error: ${error}`);
      if (content) {
        fullContent = content;
        try {
          onUpdate?.(parse(fullContent));
        } catch {}
      }
    }
    return JSON.parse(fullContent);
  } catch (error) {
    throw new Error(`Conversion script generation failed: ${error.message}`);
  }
}

/**
 * Create prompt for conversion script generation
 * @param {Object} schemaData - Schema data
 * @param {String} sourceType - Source format
 * @param {String} destType - Destination format
 * @param {String} conversionParams - Additional parameters
 * @returns {String} Formatted prompt
 */
function createConversionPrompt(schemaData, sourceType, destType, conversionParams) {
  const schemaInfo = schemaData?.schemas?.map(s => ({
    tableName: s.tableName,
    columns: s.columns?.map(c => ({ name: c.name, dataType: c.dataType, isPII: c.isPII })) || []
  })) || [];

  return `Generate Python conversion scripts for data ingestion:

**Source**: ${sourceType} → **Destination**: ${destType}
**Parameters**: ${conversionParams || 'None'}
**Schema**: ${JSON.stringify(schemaInfo, null, 2)}
**Relationships**: ${JSON.stringify(schemaData?.relationships || [], null, 2)}

Generate two scripts: convert_to_source.py and convert_to_destination.py

Requirements: uv-style inline deps, argparse with input file only, handle Excel multi-sheets automatically, error handling, PII consideration, modern Python with type hints.

Return JSON: {"sourceScript": "...", "destScript": "...", "usage": {"sourceScript": "uv run convert_to_source.py input.ext", "destScript": "uv run convert_to_destination.py source.ext output.ext"}}`;
}

function updateConversionProgress(partialData) {
  const scriptsSection = document.getElementById('generated-scripts-section');
  if (scriptsSection && partialData) {
    render(getScriptsTemplate(partialData), scriptsSection);
    scriptsSection.style.display = 'block';
  }
  
  const message = partialData.sourceScript && partialData.destScript ? 'Finalizing both conversion scripts...' :
                  partialData.sourceScript ? 'Source script generated, working on destination script...' :
                  partialData.destScript ? 'Destination script generated, working on source script...' :
                  'Generating conversion scripts...';
  
  showStatus(message);
}

const createTab = (id, title, script, isActive = false) => html`
  <li class="nav-item"><button class="nav-link ${isActive ? 'active' : ''}" id="${id}-tab" data-bs-toggle="tab" data-bs-target="#${id}" type="button" role="tab">${title}</button></li>
`;

const createTabPane = (id, filename, script, isActive = false) => html`
  <div class="tab-pane fade ${isActive ? 'show active' : ''}" id="${id}">
    <div class="d-flex justify-content-between align-items-center mb-2">
      <h6>${filename}</h6>
      <button class="btn btn-sm btn-outline-secondary" @click=${() => copyToClipboard(id + '-content')}>Copy</button>
    </div>
    <pre><code id="${id}-content">${script}</code></pre>
  </div>
`;

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
        <ul class="nav nav-tabs">
          ${createTab(sourceTabId, 'Source Converter', sourceScript, true)}
          ${createTab(destTabId, 'Destination Converter', destScript)}
        </ul>
        <div class="tab-content mt-3">
          ${createTabPane(sourceTabId, 'convert_to_source.py', sourceScript, true)}
          ${createTabPane(destTabId, 'convert_to_destination.py', destScript)}
        </div>
      </div>
    </div>
  `;
}

function displayGeneratedScripts(conversionData) {
  const scriptsSection = document.getElementById('generated-scripts-section');
  if (scriptsSection) {
    render(getScriptsTemplate(conversionData), scriptsSection);
    scriptsSection.style.display = 'block';
  }
}

function copyToClipboard(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  navigator.clipboard.writeText(element.textContent).then(() => {
    showStatus('Script copied to clipboard!', 'success');
    setTimeout(() => showStatus(''), 2000);
  }).catch(err => {
    console.error('Failed to copy to clipboard:', err);
    showStatus('Failed to copy to clipboard', 'danger');
  });
}

function handleExportWithConversionScripts() {
  if (!generatedFiles.sourceScript || !generatedFiles.destScript) {
    return showStatus('Please generate conversion scripts first.', 'warning');
  }
  
  showStatus('Downloading Python scripts...');
  downloadFile('convert_to_source.py', generatedFiles.sourceScript);
  downloadFile('convert_to_destination.py', generatedFiles.destScript);
  
  setTimeout(() => {
    showStatus('Python scripts downloaded successfully!', 'success');
    setTimeout(() => showStatus(''), 3000);
  }, 500);
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  Object.assign(a, { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}