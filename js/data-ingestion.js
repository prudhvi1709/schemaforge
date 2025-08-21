import { html, render } from 'lit-html';
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@2";
import { parse } from "https://cdn.jsdelivr.net/npm/partial-json@0.1.7/+esm";

const FORMATS = ['csv', 'excel', 'sqlite3', 'parquet', 'json'];
const formatOptions = FORMATS.map(f => html`<option value="${f}">${f.toUpperCase()} File</option>`);
let generatedFiles = { sourceScript: null, destScript: null };

export function renderDataIngestion(schemaData) {
  const ingestionContent = document.getElementById("ingestion-content");
  if (!ingestionContent) return;

  render(html`
    <div class="card">
      <div class="card-header"><h5>Data Ingestion</h5></div>
      <div class="card-body">
        <div class="row">
          <div class="col-md-6"><label>Source</label><select class="form-select" id="source-type"><option value="">Select...</option>${formatOptions}</select></div>
          <div class="col-md-6"><label>Destination</label><select class="form-select" id="dest-type"><option value="">Select...</option>${formatOptions}</select></div>
        </div>
        <div class="mb-3 mt-3">
          <textarea class="form-control" id="conversion-params" rows="2" placeholder="Optional parameters..."></textarea>
        </div>
        <button class="btn btn-primary" @click=${() => handleGenerateConversion(schemaData)}>Generate Scripts</button>
        <div id="conversion-status"></div>
      </div>
    </div>
    <div class="mt-4" id="generated-scripts-section" style="display: none;"></div>
  `, ingestionContent);
}

async function handleGenerateConversion(schemaData) {
  const sourceType = document.getElementById('source-type').value;
  const destType = document.getElementById('dest-type').value;
  const conversionParams = document.getElementById('conversion-params').value;
  const statusDiv = document.getElementById('conversion-status');
  
  if (!sourceType || !destType) return render(html`<div class="alert alert-warning">Select both formats.</div>`, statusDiv);
  
  render(html`<div class="alert alert-info">Generating scripts...</div>`, statusDiv);
  
  try {
    const llmConfig = window.getLLMConfig?.();
    if (!llmConfig) return render(html`<div class="alert alert-warning">Configure LLM first.</div>`, statusDiv);
    
    const conversionData = await generateConversionScripts(schemaData, sourceType, destType, conversionParams, llmConfig, updateConversionProgress);
    generatedFiles = conversionData;
    window.generatedConversionFiles = conversionData;
    displayGeneratedScripts(conversionData);
    render(html`<div class="alert alert-success">Scripts generated!</div>`, statusDiv);
  } catch (error) {
    render(html`<div class="alert alert-danger">Error: ${error.message}</div>`, statusDiv);
  }
}

async function generateConversionScripts(schemaData, sourceType, destType, conversionParams, llmConfig, onUpdate) {
  const prompt = createConversionPrompt(schemaData, sourceType, destType, conversionParams);
  const body = {
    model: window.getSelectedModel?.() || "gpt-4.1-mini",
    stream: true,
    messages: [{ role: "system", content: "Python expert for data conversion." }, { role: "user", content: prompt }],
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

function createConversionPrompt(schemaData, sourceType, destType, conversionParams) {
  const schemaInfo = (schemaData?.schemas || []).map(s => ({
    tableName: s.tableName,
    columns: (s.columns || []).map(c => ({ name: c.name, dataType: c.dataType, isPII: c.isPII }))
  }));

  return `Generate Python conversion scripts:

**Source**: ${sourceType}
**Destination**: ${destType}
**Params**: ${conversionParams || 'None'}

**Schema**: ${JSON.stringify(schemaInfo, null, 2)}

Generate:
1. convert_to_source.py
2. convert_to_destination.py

Requirements:
- uv script format with dependencies
- Handle multiple Excel sheets
- Use argparse for input file
- Error handling, type hints
- Runnable with: uv run script.py

Return JSON:
{
  "sourceScript": "# /// script...",
  "destScript": "# /// script...",
  "usage": { "sourceScript": "...", "destScript": "..." }
}`;
}

function updateConversionProgress(partialData) {
  const scriptsSection = document.getElementById('generated-scripts-section');
  if (scriptsSection && partialData) {
    render(getScriptsTemplate(partialData), scriptsSection);
    scriptsSection.style.display = 'block';
  }
  
  const statusDiv = document.getElementById('conversion-status');
  if (statusDiv) {
    const message = partialData.sourceScript && partialData.destScript ? 'Finalizing...' : 
                   partialData.sourceScript ? 'Source done, working on destination...' :
                   partialData.destScript ? 'Destination done, working on source...' : 'Generating...';
    render(html`<div class="alert alert-info">${message}</div>`, statusDiv);
  }
}

function getScriptsTemplate(conversionData) {
  const sourceScript = conversionData.sourceScript || 'Generating...';
  const destScript = conversionData.destScript || 'Generating...';
  
  return html`
    <div class="card">
      <div class="card-header d-flex justify-content-between">
        <h5>Generated Scripts</h5>
        <button class="btn btn-success" @click=${handleExportWithConversionScripts}>Download</button>
      </div>
      <div class="card-body">
        <ul class="nav nav-tabs">
          <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#source-tab">Source</button></li>
          <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#dest-tab">Destination</button></li>
        </ul>
        <div class="tab-content mt-3">
          <div class="tab-pane fade show active" id="source-tab">
            <div class="d-flex justify-content-between mb-2">
              <h6>convert_to_source.py</h6>
              <button class="btn btn-sm btn-outline-secondary" @click=${() => copyToClipboard('source-content')}>Copy</button>
            </div>
            <pre><code id="source-content">${sourceScript}</code></pre>
          </div>
          <div class="tab-pane fade" id="dest-tab">
            <div class="d-flex justify-content-between mb-2">
              <h6>convert_to_destination.py</h6>
              <button class="btn btn-sm btn-outline-secondary" @click=${() => copyToClipboard('dest-content')}>Copy</button>
            </div>
            <pre><code id="dest-content">${destScript}</code></pre>
          </div>
        </div>
      </div>
    </div>
  `;
}

const displayGeneratedScripts = (conversionData) => {
  const scriptsSection = document.getElementById('generated-scripts-section');
  if (scriptsSection) {
    render(getScriptsTemplate(conversionData), scriptsSection);
    scriptsSection.style.display = 'block';
  }
};

const copyToClipboard = (elementId) => {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  navigator.clipboard.writeText(element.textContent).then(() => {
    const statusDiv = document.getElementById('conversion-status');
    if (statusDiv) {
      render(html`<div class="alert alert-success">Copied!</div>`, statusDiv);
      setTimeout(() => render(html``, statusDiv), 2000);
    }
  }).catch(() => {
    const statusDiv = document.getElementById('conversion-status');
    if (statusDiv) render(html`<div class="alert alert-danger">Copy failed</div>`, statusDiv);
  });
};

const handleExportWithConversionScripts = () => {
  const statusDiv = document.getElementById('conversion-status');
  if (!generatedFiles.sourceScript || !generatedFiles.destScript) {
    return render(html`<div class="alert alert-warning">Generate scripts first.</div>`, statusDiv);
  }
  
  render(html`<div class="alert alert-info">Downloading...</div>`, statusDiv);
  downloadFile('convert_to_source.py', generatedFiles.sourceScript);
  downloadFile('convert_to_destination.py', generatedFiles.destScript);
  
  setTimeout(() => {
    render(html`<div class="alert alert-success">Downloaded!</div>`, statusDiv);
    setTimeout(() => render(html``, statusDiv), 2000);
  }, 500);
};

const downloadFile = (filename, content) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
};