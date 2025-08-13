/**
 * DBT Rules Renderer
 * Handles rendering of DBT rules and recommendations
 */

import { html, render } from 'lit-html';
import { unsafeHTML } from 'lit-html/directives/unsafe-html.js';
import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
import { cardComponent, codeBlockComponent, alertComponent } from '../utils/ui-components.js';
import { getElementById } from '../utils/dom-utils.js';

// Initialize Marked for markdown parsing
const marked = new Marked();

/**
 * Render complete results including schema and DBT rules
 * @param {Object} schemaData - Generated schema information  
 * @param {Object} dbtRulesData - Generated DBT rules
 */
export function renderResults(schemaData, dbtRulesData) {
  // Import and call schema renderer
  import('../renderers/schema-renderer.js').then(module => {
    module.renderSchemaResults(schemaData);
  });
  
  renderDbtRules(dbtRulesData);
  
  // Show the DBT tab when rules are generated
  const dbtTab = document.querySelector('[data-bs-target="#dbt-tab"]');
  if (dbtTab) {
    dbtTab.style.display = 'block';
  }
}

/**
 * Render DBT rules to the UI
 * @param {Object} dbtRulesData - DBT rules data to render
 */
export function renderDbtRules(dbtRulesData) {
  const dbtContent = getElementById("dbt-content");
  if (!dbtContent) return;
  
  if (!dbtRulesData?.dbtRules?.length) {
    render(html`<div class="alert alert-info">Generating DBT rules...</div>`, dbtContent);
    return;
  }
  
  const dbtTemplate = html`
    ${renderGlobalRecommendations(dbtRulesData.globalRecommendations)}
    ${renderTableRules(dbtRulesData.dbtRules)}
  `;
  
  render(dbtTemplate, dbtContent);
}

/**
 * Render global DBT recommendations
 * @param {Array} globalRecommendations - Array of global recommendations
 * @returns {TemplateResult} Global recommendations template
 */
function renderGlobalRecommendations(globalRecommendations) {
  if (!globalRecommendations || globalRecommendations.length === 0) {
    return html``;
  }
  
  return html`
    <div class="card mb-4">
      <div class="card-header">
        <h5 class="mb-0">Global Recommendations</h5>
      </div>
      <div class="card-body">
        ${globalRecommendations.map(rec => html`
          <div class="alert alert-info mb-2">
            <h6>${rec.title || 'Recommendation'}</h6>
            <div>${parseMarkdownContent(rec.description)}</div>
            ${rec.code ? codeBlockComponent(rec.code, 'sql', 'Example Implementation') : ''}
          </div>
        `)}
      </div>
    </div>
  `;
}

/**
 * Render table-specific DBT rules
 * @param {Array} dbtRules - Array of table rules
 * @returns {TemplateResult} Table rules template
 */
function renderTableRules(dbtRules) {
  return html`
    ${dbtRules.map(tableRules => renderTableRulesCard(tableRules))}
  `;
}

/**
 * Render DBT rules card for a specific table
 * @param {Object} tableRules - Table rules object
 * @returns {TemplateResult} Table rules card
 */
function renderTableRulesCard(tableRules) {
  const tableName = tableRules.tableName || 'Unknown Table';
  const rules = tableRules.rules || [];
  
  return html`
    <div class="card mb-4">
      <div class="card-header">
        <h5 class="mb-0">${tableName}</h5>
        ${tableRules.description ? html`
          <small class="text-muted">${tableRules.description}</small>
        ` : ''}
      </div>
      <div class="card-body">
        ${rules.length === 0 ? html`
          <p class="text-muted">No specific rules generated for this table.</p>
        ` : html`
          ${rules.map((rule, ruleIndex) => renderRule(rule, ruleIndex, tableName))}
        `}
      </div>
    </div>
  `;
}

/**
 * Render individual DBT rule
 * @param {Object} rule - Rule object
 * @param {number} ruleIndex - Rule index
 * @param {string} tableName - Table name
 * @returns {TemplateResult} Rule template
 */
function renderRule(rule, ruleIndex, tableName) {
  const ruleType = rule.type || 'generic';
  const ruleId = `${tableName}-rule-${ruleIndex}`;
  
  const badgeClass = {
    'test': 'bg-primary',
    'macro': 'bg-info',
    'model': 'bg-success',
    'snapshot': 'bg-warning',
    'seed': 'bg-secondary',
    'source': 'bg-dark',
    'generic': 'bg-light text-dark'
  }[ruleType] || 'bg-light text-dark';
  
  return html`
    <div class="border rounded p-3 mb-3">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="mb-0">
          ${rule.name || `Rule ${ruleIndex + 1}`}
          <span class="badge ${badgeClass} ms-2">${ruleType}</span>
        </h6>
        ${rule.severity ? html`
          <span class="badge ${getSeverityBadgeClass(rule.severity)}">${rule.severity}</span>
        ` : ''}
      </div>
      
      ${rule.description ? html`
        <p class="text-muted mb-2">${rule.description}</p>
      ` : ''}
      
      ${rule.reasoning ? html`
        <div class="mb-2">
          <small class="text-muted">
            <strong>Reasoning:</strong> ${rule.reasoning}
          </small>
        </div>
      ` : ''}
      
      ${rule.code ? html`
        <div class="mt-2">
          ${codeBlockComponent(rule.code, getCodeLanguage(ruleType), `${rule.name || 'Rule'} Implementation`)}
        </div>
      ` : ''}
      
      ${rule.tags && rule.tags.length > 0 ? html`
        <div class="mt-2">
          <strong>Tags:</strong>
          ${rule.tags.map(tag => html`
            <span class="badge bg-outline-secondary ms-1">${tag}</span>
          `)}
        </div>
      ` : ''}
      
      ${renderRuleMetadata(rule)}
    </div>
  `;
}

/**
 * Render rule metadata
 * @param {Object} rule - Rule object
 * @returns {TemplateResult} Metadata template
 */
function renderRuleMetadata(rule) {
  const metadata = [];
  
  if (rule.columns && rule.columns.length > 0) {
    metadata.push(html`
      <div>
        <strong>Columns:</strong> <code>${rule.columns.join(', ')}</code>
      </div>
    `);
  }
  
  if (rule.config) {
    metadata.push(html`
      <div>
        <strong>Config:</strong>
        <pre class="bg-light p-2 rounded"><code>${JSON.stringify(rule.config, null, 2)}</code></pre>
      </div>
    `);
  }
  
  if (rule.documentation) {
    metadata.push(html`
      <div>
        <strong>Documentation:</strong>
        <div class="mt-1">${parseMarkdownContent(rule.documentation)}</div>
      </div>
    `);
  }
  
  if (metadata.length === 0) {
    return html``;
  }
  
  return html`
    <div class="mt-3 pt-2 border-top">
      ${metadata}
    </div>
  `;
}

/**
 * Get severity badge CSS class
 * @param {string} severity - Rule severity
 * @returns {string} Bootstrap badge class
 */
function getSeverityBadgeClass(severity) {
  const severityClasses = {
    'critical': 'bg-danger',
    'high': 'bg-warning',
    'medium': 'bg-primary',
    'low': 'bg-info',
    'info': 'bg-secondary'
  };
  
  return severityClasses[severity.toLowerCase()] || 'bg-secondary';
}

/**
 * Get code language based on rule type
 * @param {string} ruleType - DBT rule type
 * @returns {string} Code language identifier
 */
function getCodeLanguage(ruleType) {
  const languageMap = {
    'test': 'sql',
    'macro': 'sql',
    'model': 'sql',
    'snapshot': 'sql',
    'seed': 'csv',
    'source': 'yaml',
    'generic': 'sql'
  };
  
  return languageMap[ruleType] || 'sql';
}

/**
 * Parse markdown content safely
 * @param {string} content - Markdown content
 * @returns {TemplateResult} Parsed HTML template
 */
function parseMarkdownContent(content) {
  if (!content || typeof content !== 'string') {
    return html``;
  }
  
  try {
    const parsedHtml = marked.parse(content);
    return unsafeHTML(parsedHtml);
  } catch (error) {
    console.warn('Failed to parse markdown content:', error);
    return html`<span>${content}</span>`;
  }
}

/**
 * Show DBT rule loading indicator
 * @param {boolean} show - Whether to show the indicator
 */
export function showDbtRuleLoadingIndicator(show) {
  const dbtContent = getElementById("dbt-content");
  if (!dbtContent) return;
  
  if (show) {
    render(html`
      <div class="text-center p-4">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <div class="mt-3">
          <h5>Generating DBT Rules</h5>
          <p class="text-muted">Please wait while we analyze your data and generate appropriate DBT rules...</p>
        </div>
      </div>
    `, dbtContent);
  }
  // If show is false, the content will be replaced by the actual rules
}