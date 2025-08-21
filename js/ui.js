import { html, render } from 'lit-html';
import { unsafeHTML } from 'lit-html/directives/unsafe-html.js';
import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
import { renderEntityRelationshipDiagram } from './diagram.js';

const marked = new Marked();
const expandBtn = (prefix) => html`<div class="d-flex justify-content-end mb-3"><button class="btn btn-sm btn-outline-primary" onclick="expandAllCards('${prefix}')">⤢ Expand All</button></div>`;
const loadingAlert = (msg) => html`<div class="alert alert-info">${msg}</div>`;

const createBadges = (col) => {
  const badges = [];
  if (col.isPrimaryKey) badges.push(html`<span class="badge bg-warning text-dark">PK</span>`);
  if (col.isForeignKey) badges.push(html`<span class="badge bg-info">FK</span>`);
  if (col.isPII) badges.push(html`<span class="badge bg-danger">PII</span>`);
  if (col.dataClassification) badges.push(html`<span class="badge bg-primary">${col.dataClassification}</span>`);
  return badges;
};

export function renderSchemaResults(schemaData) {
  renderSchemaOverview(schemaData);
  renderColumnDescriptions(schemaData);
  renderRelationships(schemaData);
  renderJoinsAndModeling(schemaData);
  renderEntityRelationshipDiagram(schemaData);
  const dbtTab = document.querySelector('[data-bs-target="#dbt-tab"]');
  if (dbtTab) {
    dbtTab.style.display = 'none';
    render(html`<div class="text-muted">Generate DBT rules first.</div>`, document.getElementById('dbt-content'));
  }
}

export const renderResults = (schemaData, dbtRulesData) => {
  renderSchemaResults(schemaData);
  renderDbtRules(dbtRulesData);
  document.querySelector('[data-bs-target="#dbt-tab"]').style.display = 'block';
};

export function renderSchemaOverview(schemaData) {
  const content = document.getElementById("schema-content");
  if (!schemaData?.schemas?.length) return render(loadingAlert("Generating schema..."), content);
  
  render(html`${expandBtn('schema-collapse')}
    ${schemaData.schemas.map((schema, idx) => html`
      <div class="card mb-3">
        <div class="card-header" role="button" data-bs-toggle="collapse" data-bs-target="#schema-collapse-${idx}">
          <h5>${schema.tableName}</h5>
        </div>
        <div class="collapse" id="schema-collapse-${idx}">
          <div class="card-body">
            <p>${schema.description || 'No description'}</p>
            ${schema.primaryKey ? html`<div class="alert alert-info">PK: ${schema.primaryKey.columns.join(', ')}</div>` : ''}
            <table class="table table-sm">
              <thead><tr><th>Name</th><th>Type</th><th>Flags</th></tr></thead>
              <tbody>${schema.columns?.map(col => html`<tr><td>${col.name}</td><td><code>${col.dataType}</code></td><td>${createBadges(col)}</td></tr>`) || html`<tr><td colspan="3">Loading...</td></tr>`}</tbody>
            </table>
          </div>
        </div>
      </div>
    `)}`, content);
}

export function renderColumnDescriptions(schemaData) {
  const content = document.getElementById("columns-content");
  if (!schemaData?.schemas?.length) return render(loadingAlert("Generating columns..."), content);
  
  render(html`${expandBtn('column-collapse')}
    ${schemaData.schemas.map((schema, schemaIdx) => html`
      <h5>${schema.tableName}</h5>
      ${schema.columns?.map((col, colIdx) => html`
        <div class="card mb-2">
          <div class="card-header d-flex justify-content-between" role="button" data-bs-toggle="collapse" data-bs-target="#column-collapse-${schemaIdx}-${colIdx}">
            <span><strong>${col.name}</strong> <code>${col.dataType}</code></span>
            <div>${createBadges(col)}</div>
          </div>
          <div class="collapse" id="column-collapse-${schemaIdx}-${colIdx}">
            <div class="card-body">
              <p>${col.description || 'No description'}</p>
              ${col.foreignKeyReference ? html`<div class="alert alert-info">FK: ${col.foreignKeyReference.referencedTable}.${col.foreignKeyReference.referencedColumn}</div>` : ''}
            </div>
          </div>
        </div>
      `) || loadingAlert("Loading columns...")}
    `)}`, content);
}

export function renderRelationships(schemaData) {
  const content = document.getElementById("relationships-content");
  if (!schemaData?.relationships?.length) return render(html`<div class="text-muted">No relationships identified.</div>`, content);
  
  render(html`
    ${schemaData.relationships.map(rel => html`
      <div class="card mb-3">
        <div class="card-body">
          <h6>${rel.fromTable} → ${rel.toTable}</h6>
          <p><strong>Type:</strong> ${rel.relationshipType}</p>
          <p><strong>Join:</strong> ${rel.fromTable}.${rel.fromColumn} → ${rel.toTable}.${rel.toColumn}</p>
        </div>
      </div>
    `)}`, content);
}

export function renderJoinsAndModeling(schemaData) {
  const content = document.getElementById("joins-content");
  
  render(html`
    ${schemaData.suggestedJoins?.length ? html`
      <h6>Suggested Joins</h6>
      ${schemaData.suggestedJoins.map(join => html`
        <div class="card mb-3">
          <div class="card-body">
            <h6>${join.description}</h6>
            <p><strong>Use Case:</strong> ${join.useCase}</p>
            <pre><code>${join.sqlPattern}</code></pre>
          </div>
        </div>
      `)}` : ''}
    ${schemaData.modelingRecommendations?.length ? html`
      <h6>Recommendations</h6>
      <ul>${schemaData.modelingRecommendations.map(rec => html`<li>${rec}</li>`)}</ul>` : ''}
  `, content);
}

export function renderDbtRules(dbtRulesData) {
  const content = document.getElementById("dbt-content");
  if (!dbtRulesData?.dbtRules?.length) return render(loadingAlert("Generating DBT rules..."), content);
  
  render(html`${expandBtn('dbt-collapse')}
    ${dbtRulesData.globalRecommendations?.length ? html`
      <div class="card mb-3">
        <div class="card-header"><h5>Global Recommendations</h5></div>
        <div class="card-body">
          <ul>${dbtRulesData.globalRecommendations.map(rec => html`<li>${rec}</li>`)}</ul>
        </div>
      </div>` : ''}
    ${dbtRulesData.dbtRules.map((rule, idx) => html`
      <div class="card mb-3">
        <div class="card-header d-flex justify-content-between" role="button" data-bs-toggle="collapse" data-bs-target="#dbt-collapse-${idx}">
          <h5>${rule.tableName}</h5>
          <button class="btn btn-sm btn-outline-secondary" @click=${(e) => {e.stopPropagation(); copyToClipboard(rule.modelSql || '')}}>Copy SQL</button>
        </div>
        <div class="collapse" id="dbt-collapse-${idx}">
          <div class="card-body">
            ${rule.modelSql ? html`<h6>SQL Model</h6><pre><code>${rule.modelSql}</code></pre>` : ''}
            ${rule.tests?.length ? html`<h6>Tests</h6><ul>${rule.tests.map(test => html`<li><strong>${test.column}:</strong> ${test.tests?.join(', ') || 'No tests'}</li>`)}</ul>` : ''}
          </div>
        </div>
      </div>
    `)}`, content);
}

export function renderChatMessage(role, message, isMarkdown = false) {
  const messagesContainer = document.getElementById("chat-messages-floating");
  if (!messagesContainer) return;
  
  const messageElement = document.createElement("div");
  messageElement.className = "card mb-2";
  const bgClass = role === "user" ? "bg-primary text-white" : role === "system" ? "bg-warning" : "bg-light";
  
  render(html`
    <div class="card-body ${bgClass}">
      <strong>${role}:</strong>
      ${isMarkdown ? unsafeHTML(marked.parse(message)) : message}
    </div>
  `, messageElement);
  
  messagesContainer.appendChild(messageElement);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

export function showDbtRuleLoadingIndicator(isLoading) {
  const chatContainer = document.getElementById("chat-messages-floating");
  if (!chatContainer) return;
  
  let indicator = document.getElementById("dbt-rule-loading-indicator");
  if (isLoading && !indicator) {
    indicator = document.createElement("div");
    indicator.id = "dbt-rule-loading-indicator";
    indicator.className = "card mb-2";
    render(html`<div class="card-body bg-info text-white">🔄 Updating DBT rules...</div>`, indicator);
    chatContainer.appendChild(indicator);
  } else if (!isLoading && indicator) {
    indicator.remove();
  }
  if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
}

const copyToClipboard = (text) => navigator.clipboard?.writeText(text);