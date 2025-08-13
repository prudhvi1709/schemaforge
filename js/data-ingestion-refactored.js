/**
 * Data Ingestion Module (Refactored)
 * Handles data conversion interface using shared utilities and components
 */

import { html, render } from 'lit-html';
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@2";
import { parse } from "https://cdn.jsdelivr.net/npm/partial-json@0.1.7/+esm";

import { formFieldComponent, tabsComponent, buttonComponent, alertComponent, codeBlockComponent } from './utils/ui-components.js';
import { getElementById } from './utils/dom-utils.js';
import { downloadFile, downloadMultipleFiles } from './utils/file-utils.js';
import { updateStatus, showLoadingStatus, showTemporaryStatus } from './core/status-manager.js';
import { copyToClipboard } from './utils/dom-utils.js';

const SUPPORTED_FORMATS = [
  { value: 'csv', label: 'CSV File' },
  { value: 'excel', label: 'Excel File' },
  { value: 'sql', label: 'SQL Database (.db)' },
  { value: 'parquet', label: 'Parquet File' },
  { value: 'json', label: 'JSON File' }
];

let generatedFiles = {
  sourceScript: null,
  destScript: null
};

/**
 * Render the data ingestion interface
 * @param {Object} schemaData - Schema data for context
 */
export function renderDataIngestion(schemaData) {
  const ingestionContent = getElementById("ingestion-content");
  if (!ingestionContent) {
    console.warn("Ingestion content element not found");
    return;
  }

  const template = html`
    <div class="card">
      <div class="card-header">
        <h5 class="mb-0">Data Ingestion Configuration</h5>
      </div>
      <div class="card-body">
        ${renderConfigurationForm()}
        ${renderActionButtons(schemaData)}
        <div id="conversion-status"></div>
      </div>
    </div>
    
    <div class="mt-4" id="generated-scripts-section" style="display: none;">
      <!-- Scripts will be rendered here dynamically -->
    </div>
  `;
  
  render(template, ingestionContent);
}

/**
 * Render configuration form
 * @returns {TemplateResult} Configuration form template
 */
function renderConfigurationForm() {
  return html`
    <div class="row">
      <div class="col-md-6">
        ${formFieldComponent({
          type: 'select',
          id: 'source-type',
          label: 'Source Format',
          placeholder: 'Select source format...',
          options: SUPPORTED_FORMATS,
          required: true
        })}
      </div>
      <div class="col-md-6">
        ${formFieldComponent({
          type: 'select',
          id: 'dest-type',
          label: 'Destination Format',
          placeholder: 'Select destination format...',
          options: SUPPORTED_FORMATS,
          required: true
        })}
      </div>
    </div>
    
    ${formFieldComponent({
      type: 'textarea',
      id: 'conversion-params',
      label: 'Conversion Parameters (Optional)',
      placeholder: 'Enter any specific conversion parameters, filters, or transformations needed...',
      helpText: 'Examples: Filter specific columns, date range filtering, data type conversions, etc.'
    })}
  `;
}

/**
 * Render action buttons
 * @param {Object} schemaData - Schema data
 * @returns {TemplateResult} Action buttons template
 */
function renderActionButtons(schemaData) {
  return html`
    <div class="d-flex gap-2 mb-3">
      ${buttonComponent({
        text: 'Generate Conversion Scripts',
        variant: 'primary',
        id: 'generate-conversion-btn',
        onClick: () => handleGenerateConversion(schemaData)
      })}
    </div>
  `;
}

/**
 * Handle conversion script generation
 * @param {Object} schemaData - Schema data for context
 */
async function handleGenerateConversion(schemaData) {
  const sourceType = getElementById('source-type').value;
  const destType = getElementById('dest-type').value;
  const conversionParams = getElementById('conversion-params').value;
  const statusDiv = getElementById('conversion-status');
  
  if (!sourceType || !destType) {
    render(alertComponent("Please select both source and destination formats.", "warning"), statusDiv);
    return;
  }
  
  showLoadingStatus("Generating conversion scripts...", "conversion-status");
  
  try {
    // Get LLM config from global scope
    const llmConfig = window.getLLMConfig?.();
    if (!llmConfig) {
      render(alertComponent("Please configure LLM settings first by clicking 'Configure LLM Provider' in the upload section.", "warning"), statusDiv);
      return;
    }
    
    // Generate conversion scripts using LLM with streaming
    const conversionData = await generateConversionScripts(
      schemaData, 
      sourceType, 
      destType, 
      conversionParams, 
      llmConfig,
      updateConversionProgress
    );
    
    // Store generated files
    generatedFiles = conversionData;
    
    // Make available globally for DBT local export
    window.generatedConversionFiles = conversionData;
    
    // Display the generated scripts
    displayGeneratedScripts(conversionData);
    
    render(alertComponent("Conversion scripts generated successfully!", "success"), statusDiv);
    
  } catch (error) {
    console.error('Error generating conversion scripts:', error);
    render(alertComponent(`Error: ${error.message}`, "danger"), statusDiv);
  }
}

/**
 * Generate conversion scripts using LLM with streaming
 * @param {Object} schemaData - Schema data for context
 * @param {String} sourceType - Source format type
 * @param {String} destType - Destination format type
 * @param {String} conversionParams - Additional conversion parameters
 * @param {Object} llmConfig - LLM configuration
 * @param {Function} onUpdate - Callback for streaming updates
 * @returns {Object} Generated scripts object
 */
async function generateConversionScripts(schemaData, sourceType, destType, conversionParams, llmConfig, onUpdate) {
  try {
    const prompt = createConversionPrompt(schemaData, sourceType, destType, conversionParams);
    
    const body = {
      model: window.getSelectedModel?.() || "gpt-4.1-mini",
      stream: true,
      messages: [
        {
          role: "system",
          content: "You are a Python expert specializing in data conversion scripts. Generate clean, efficient, and well-documented Python code."
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    };

    let fullContent = "";
    let parsedContent = null;
    
    for await (const { content, error } of asyncLLM(`${llmConfig.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${llmConfig.apiKey}`
      },
      body: JSON.stringify(body),
    })) {
      if (error) throw new Error(`LLM API error: ${error}`);
      
      if (content) {
        fullContent = content;
        
        try {
          parsedContent = parse(fullContent);
          if (onUpdate && typeof onUpdate === 'function') {
            onUpdate(parsedContent);
          }
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
 * Create prompt for conversion script generation
 */
function createConversionPrompt(schemaData, sourceType, destType, conversionParams) {
  const schemas = schemaData?.schemas || [];
  const schemaInfo = schemas.map(schema => ({
    tableName: schema.tableName,
    columns: schema.columns?.map(col => ({ name: col.name, dataType: col.dataType, isPII: col.isPII })) || []
  }));

  return `Generate Python conversion scripts for data ingestion:

**Source**: ${sourceType} **Destination**: ${destType} 
**Parameters**: ${conversionParams || 'None'}
**Schema**: ${JSON.stringify(schemaInfo, null, 2)}

Generate two Python scripts with uv dependencies:
1. convert_to_source.py - Converts uploaded file to ${sourceType}
2. convert_to_destination.py - Converts ${sourceType} to ${destType}

Requirements:
- Use uv script format with dependencies
- Handle Excel sheets separately 
- For .db files: use SQLite/DuckDB directly
- For .sql files: parse INSERT statements, don't execute
- Create proper directory structure
- Include error handling and validation
- **CRITICAL: Use clean table names without prefixes (e.g., 'patients.csv' not 'table1_Patients.csv')**
- **CRITICAL: For Excel sheets, use lowercase sheet names as filenames**
- Return JSON: {"sourceScript": "...", "destScript": "...", "usage": {...}, "workflow": "..."}`;
}

/**
 * Update conversion progress with streaming data
 * @param {Object} partialData - Partial conversion data from streaming
 */
function updateConversionProgress(partialData) {
  const scriptsSection = getElementById('generated-scripts-section');
  if (scriptsSection && partialData) {
    render(getScriptsTemplate(partialData), scriptsSection);
    scriptsSection.style.display = 'block';
  }
  
  // Update status with progress information
  const statusDiv = getElementById('conversion-status');
  if (statusDiv) {
    let progressMessage = 'Generating conversion scripts...';
    
    if (partialData.sourceScript && partialData.destScript) {
      progressMessage = 'Finalizing both conversion scripts...';
    } else if (partialData.sourceScript) {
      progressMessage = 'Source script generated, working on destination script...';
    } else if (partialData.destScript) {
      progressMessage = 'Destination script generated, working on source script...';
    }
    
    render(alertComponent(progressMessage, "info"), statusDiv);
  }
}

/**
 * Display generated scripts in the UI
 * @param {Object} conversionData - Generated conversion data
 */
function displayGeneratedScripts(conversionData) {
  const scriptsSection = getElementById('generated-scripts-section');
  
  if (scriptsSection) {
    render(getScriptsTemplate(conversionData), scriptsSection);
    scriptsSection.style.display = 'block';
  }
}

/**
 * Get scripts template for rendering
 * @param {Object} conversionData - Conversion data with scripts
 * @returns {TemplateResult} Scripts template
 */
function getScriptsTemplate(conversionData) {
  const sourceScript = conversionData.sourceScript || 'Generating source script...';
  const destScript = conversionData.destScript || 'Generating destination script...';
  
  const tabs = [
    {
      id: 'source-converter-tab',
      label: 'Source Converter',
      content: html`
        <div class="d-flex justify-content-between align-items-center mb-2">
          <h6>convert_to_source.py</h6>
          ${buttonComponent({
            text: 'Copy',
            variant: 'outline-secondary',
            size: 'sm',
            onClick: () => handleCopyScript(sourceScript)
          })}
        </div>
        ${codeBlockComponent(sourceScript, 'python', '', false)}
      `,
      active: true
    },
    {
      id: 'dest-converter-tab',
      label: 'Destination Converter',
      content: html`
        <div class="d-flex justify-content-between align-items-center mb-2">
          <h6>convert_to_destination.py</h6>
          ${buttonComponent({
            text: 'Copy',
            variant: 'outline-secondary',
            size: 'sm',
            onClick: () => handleCopyScript(destScript)
          })}
        </div>
        ${codeBlockComponent(destScript, 'python', '', false)}
      `,
      active: false
    }
  ];
  
  return html`
    <div class="card">
      <div class="card-header d-flex justify-content-between align-items-center">
        <h5 class="mb-0">Generated Conversion Scripts</h5>
        ${buttonComponent({
          text: 'Download Python Scripts',
          variant: 'success',
          onClick: handleExportScripts
        })}
      </div>
      <div class="card-body">
        ${conversionData.workflow ? html`
          <div class="alert alert-info mb-3">
            <h6><strong>Conversion Workflow:</strong></h6>
            <pre style="margin: 0; white-space: pre-line;">${conversionData.workflow}</pre>
          </div>
        ` : ''}
        
        ${conversionData.usage ? html`
          <div class="alert alert-secondary mb-3">
            <h6><strong>Usage Examples:</strong></h6>
            <p><strong>Step 1 (Source Conversion):</strong></p>
            <code>${conversionData.usage.sourceScript}</code>
            <p class="mt-2 mb-1"><strong>Step 2 (Destination Conversion):</strong></p>
            <code>${conversionData.usage.destScript}</code>
          </div>
        ` : ''}
        
        ${tabsComponent(tabs, 'conversion-scripts')}
      </div>
    </div>
  `;
}

/**
 * Handle copying script to clipboard
 * @param {string} scriptContent - Script content to copy
 */
async function handleCopyScript(scriptContent) {
  const success = await copyToClipboard(scriptContent);
  const message = success ? "Script copied to clipboard!" : "Failed to copy to clipboard";
  const type = success ? "success" : "danger";
  
  showTemporaryStatus(message, type, 2000, "conversion-status");
}

/**
 * Handle export of conversion scripts as Python files
 */
function handleExportScripts() {
  if (!generatedFiles.sourceScript || !generatedFiles.destScript) {
    showTemporaryStatus("Please generate conversion scripts first.", "warning", 3000, "conversion-status");
    return;
  }
  
  showTemporaryStatus("Downloading Python scripts...", "info", 1000, "conversion-status");
  
  const files = [
    {
      filename: 'convert_to_source.py',
      content: generatedFiles.sourceScript,
      mimeType: 'text/x-python'
    },
    {
      filename: 'convert_to_destination.py',
      content: generatedFiles.destScript,
      mimeType: 'text/x-python'
    }
  ];
  
  downloadMultipleFiles(files);
  
  setTimeout(() => {
    showTemporaryStatus("Python scripts downloaded successfully!", "success", 3000, "conversion-status");
  }, 500);
}