import { html, render } from 'lit-html';
import { unsafeHTML } from 'lit-html/directives/unsafe-html.js';
import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
import { renderEntityRelationshipDiagram } from './diagram.js';

const marked = new Marked();

// Common SVG icons and components
const expandIcon = html`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrows-expand" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1 8a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 0 1h-13A.5.5 0 0 1 1 8ZM7.646.146a.5.5 0 0 1 .708 0l2 2a.5.5 0 0 1-.708.708L8.5 1.707V5.5a.5.5 0 0 1-1 0V1.707L6.354 2.854a.5.5 0 0 1-.708-.708l2-2ZM8 10a.5.5 0 0 1 .5.5v3.793l1.146-1.147a.5.5 0 0 1 .708.708l-2 2a.5.5 0 0 1-.708 0l-2-2a.5.5 0 0 1 .708-.708L7.5 14.293V10.5A.5.5 0 0 1 8 10Z"/></svg>`;
const chevronIcon = html`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-chevron-down" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg>`;
const clipboardIcon = html`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-clipboard" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg>`;

const expandBtn = (prefix) => html`<div class="d-flex justify-content-end mb-3"><button class="btn btn-sm btn-outline-primary" onclick="expandAllCards('${prefix}')">${expandIcon} Expand All</button></div>`;
const loadingAlert = (msg) => html`<div class="alert alert-info">${msg}</div>`;

const createBadges = (col) => {
  const badgeConfigs = [
    { condition: col.isPrimaryKey, label: 'PK', class: 'bg-warning text-dark' },
    { condition: col.isForeignKey, label: 'FK', class: 'bg-info' },
    { condition: col.isPII,        label: 'PII', class: 'bg-danger' },
  ];

  // Add data classification badge
  if (col.dataClassification) {
    badgeConfigs.push({ condition: true, label: col.dataClassification, class: 'bg-primary' });
  }

  // Add any additional flags from LLM response
  if (col.flags) {
    col.flags.forEach(flag => {
      badgeConfigs.push({ condition: true, label: flag.label, class: flag.class || 'bg-secondary' });
    });
  }

  return badgeConfigs
    .filter(b => b.condition)
    .map(b => html`<span class="badge ${b.class}">${b.label}</span>`);
};


export function renderSchemaResults(schemaData) {
  renderSchemaOverview(schemaData);
  renderColumnDescriptions(schemaData);
  renderRelationships(schemaData);
  renderJoinsAndModeling(schemaData);
  renderEntityRelationshipDiagram(schemaData);
  
  const dbtTab = document.querySelector('[data-bs-target="#dbt-tab"]');
  const dbtContent = document.getElementById('dbt-content');
  if (dbtTab && dbtContent) {
    dbtTab.style.display = 'none';
    render(html`<div class="text-muted">Generate DBT rules first to see this content.</div>`, dbtContent);
  }
}

export function renderResults(schemaData, dbtRulesData) {
  renderSchemaResults(schemaData);
  renderDbtRules(dbtRulesData);
  document.querySelector('[data-bs-target="#dbt-tab"]')?.style.setProperty('display', 'block');
}

export function renderSchemaOverview(schemaData) {
  const content = document.getElementById("schema-content");
  
  if (!schemaData?.schemas?.length) {
    return render(loadingAlert("Generating schema information..."), content);
  }
  
  const template = html`
    ${expandBtn('schema-collapse')}
    ${schemaData.schemas.map((schema, idx) => {
      const collapseId = `schema-collapse-${idx}`;
      const typeBadge = schema.tableType ? html`<span class="badge bg-secondary ms-2">${schema.tableType}</span>` : '';
      const pkInfo = schema.primaryKey ? html`
        <div class="alert alert-info mt-2">
          <strong>Primary Key:</strong> ${schema.primaryKey.columns.join(', ')} 
          <span class="badge bg-primary ms-2">${schema.primaryKey.type}</span>
          <span class="badge bg-light text-dark ms-1">${schema.primaryKey.confidence} confidence</span>
        </div>` : '';
      
      return html`
        <div class="card mb-3">
          <div class="card-header" role="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false">
            <div class="d-flex justify-content-between align-items-center">
              <h5 class="mb-0">${schema.tableName}${typeBadge}</h5>
              ${chevronIcon}
            </div>
          </div>
          <div class="collapse" id="${collapseId}">
            <div class="card-body">
              <p>${schema.description || 'No description available'}</p>
              ${pkInfo}
              <h6>Columns</h6>
              <div class="table-responsive">
                <table class="table table-sm">
                  <thead><tr><th>Name</th><th>Type</th><th>Description</th><th>Flags</th></tr></thead>
                  <tbody>
                    ${schema.columns?.map(col => html`
                      <tr>
                        <td>${col.name}</td>
                        <td><code>${col.dataType}</code></td>
                        <td>${col.description || 'Generating description...'}</td>
                        <td>${createBadges(col)}</td>
                      </tr>
                    `) || html`<tr><td colspan="4">Loading column information...</td></tr>`}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>`;
    })}`;
  
  render(template, content);
}

export function renderColumnDescriptions(schemaData) {
  const content = document.getElementById("columns-content");
  
  if (!schemaData?.schemas?.length) {
    return render(loadingAlert("Generating column descriptions..."), content);
  }
  
  const template = html`
    ${expandBtn('column-collapse')}
    ${schemaData.schemas.map((schema, schemaIdx) => html`
      <h5>${schema.tableName}</h5>
      ${schema.columns?.map((col, colIdx) => {
        const collapseId = `column-collapse-${schemaIdx}-${colIdx}`;
        const fkInfo = col.foreignKeyReference ? html`
          <div class="alert alert-info mt-2">
            <strong>Foreign Key Reference:</strong><br>
            References: <code>${col.foreignKeyReference.referencedTable}.${col.foreignKeyReference.referencedColumn}</code>
            <span class="badge bg-light text-dark ms-2">${col.foreignKeyReference.confidence} confidence</span>
          </div>` : '';
        
        return html`
          <div class="card mb-2">
            <div class="card-header d-flex justify-content-between align-items-center" role="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
              <span><strong>${col.name}</strong> <code class="ms-2">${col.dataType}</code></span>
              <div class="d-flex align-items-center">
                <div class="me-2">${createBadges(col)}</div>
                ${chevronIcon}
              </div>
            </div>
            <div class="collapse" id="${collapseId}">
              <div class="card-body">
                <p>${col.description || 'No description available'}</p>
                ${fkInfo}
                ${col.qualityObservations?.length ? html`<h6>Data Quality Observations</h6><ul>${col.qualityObservations.map(obs => html`<li>${obs}</li>`)}</ul>` : ''}
                ${col.constraints?.length ? html`<h6>Constraints</h6><ul>${col.constraints.map(c => html`<li>${c}</li>`)}</ul>` : ''}
              </div>
            </div>
          </div>`;
      }) || loadingAlert("Loading column details...")}
    `)}`;
  
  render(template, content);
}

export function showDbtRuleLoadingIndicator(isLoading) {
  const chatContainer = document.getElementById("chat-messages-floating");
  if (!chatContainer) return;
  
  let indicator = document.getElementById("dbt-rule-loading-indicator");
  
  if (isLoading && !indicator) {
    indicator = document.createElement("div");
    indicator.id = "dbt-rule-loading-indicator";
    indicator.className = "card mb-2";
    render(html`
      <div class="card-body">
        <div class="d-flex align-items-center">
          <div class="spinner-border spinner-border-sm me-2" role="status"></div>
          <p class="card-text mb-0">Processing DBT rule changes...</p>
        </div>
      </div>`, indicator);
    chatContainer.appendChild(indicator);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  } else if (!isLoading && indicator) {
    indicator.remove();
  }
}

export function renderDbtRules(dbtRulesData) {
  const content = document.getElementById("dbt-content");
  if (!content) return;
  
  if (!dbtRulesData?.dbtRules?.length) {
    return render(loadingAlert("Generating DBT rules..."), content);
  }
  
  const summaryContent = dbtRulesData.summary ? (
    dbtRulesData.summary.includes('- ') || dbtRulesData.summary.includes('* ') 
      ? dbtRulesData.summary 
      : dbtRulesData.summary.replace(/([.!?])\s+/g, "$1\n").split('\n').filter(s => s.trim()).map(s => `- ${s}`).join('\n')
  ) : '';
  
  const template = html`
    ${summaryContent ? html`<div class="alert alert-primary mb-4"><h5>DBT Rules Summary</h5>${formatChatMessageWithMarked(summaryContent)}</div>` : ''}
    ${dbtRulesData.globalRecommendations?.length ? html`<div class="alert alert-success mb-4"><h6>Global DBT Project Recommendations</h6><ul class="mb-0">${dbtRulesData.globalRecommendations.map(rec => html`<li>${rec}</li>`)}</ul></div>` : ''}
    
    <div class="position-fixed top-0 end-0 p-3" style="z-index: 1080">
      <div id="copyToast" class="toast align-items-center text-white bg-success" role="alert">
        <div class="d-flex">
          <div class="toast-body">Content copied to clipboard!</div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
      </div>
    </div>
    
    ${dbtRulesData.dbtRules.map(rule => {
      const tableId = rule.tableName.replace(/\s/g, '_');
      const matBadge = rule.materialization ? html`<span class="badge bg-info ms-2">${rule.materialization}</span>` : '';
      
      return html`
        <div class="card mb-3">
          <div class="card-header"><h5 class="mb-0">${rule.tableName}${matBadge}</h5></div>
          <div class="card-body">
            <ul class="nav nav-tabs" id="rule-tabs-${tableId}">
              <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#sql-${tableId}">SQL</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#yaml-${tableId}">YAML</button></li>
              <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#tests-${tableId}">Tests</button></li>
              ${rule.relationships?.length ? html`<li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#relationships-${tableId}">Relationships</button></li>` : ''}
            </ul>
            
            <div class="tab-content mt-3">
              ${renderTabPane('sql', tableId, rule.modelSql || 'Generating SQL...', true)}
              ${renderTabPane('yaml', tableId, rule.yamlConfig || 'Generating YAML config...', false)}
              
              <div class="tab-pane fade" id="tests-${tableId}">
                ${rule.tests?.length ? html`
                  <table class="table table-sm">
                    <thead><tr><th>Column</th><th>Tests</th><th>Relationships</th></tr></thead>
                    <tbody>
                      ${rule.tests.map(test => html`
                        <tr>
                          <td>${test.column}</td>
                          <td><ul class="mb-0">${test.tests?.map(t => html`<li>${t}</li>`) || html`<li>Loading tests...</li>`}</ul></td>
                          <td>${test.relationships?.length ? html`<ul class="mb-0">${test.relationships.map(rel => html`<li><code>${rel.test}</code> → ${rel.to} (${rel.field})</li>`)}</ul>` : html`<span class="text-muted">None</span>`}</td>
                        </tr>`)}
                    </tbody>
                  </table>
                ` : loadingAlert("Generating tests...")}
                ${rule.recommendations?.length ? html`<h6 class="mt-3">Model-Specific Recommendations</h6><ul>${rule.recommendations.map(rec => html`<li>${rec}</li>`)}</ul>` : ''}
              </div>
              
              ${rule.relationships?.length ? html`
              <div class="tab-pane fade" id="relationships-${tableId}">
                <div class="d-flex justify-content-end mb-2">
                  <button class="btn btn-sm btn-outline-secondary copy-btn" data-content-id="relationships-content-${tableId}">${clipboardIcon} Copy</button>
                </div>
                <div id="relationships-content-${tableId}">
                  <h6>Table Relationships</h6>
                  ${rule.relationships.map(rel => html`
                    <div class="card mb-2">
                      <div class="card-body">
                        <p><strong>Description:</strong> ${rel.description}</p>
                        <h6>Join Logic:</h6>
                        <pre><code>${rel.joinLogic}</code></pre>
                      </div>
                    </div>`)}
                </div>
              </div>` : ''}
            </div>
          </div>
        </div>`;
    })}`;
  
  render(template, content);
  
  setupCopyButtons();
}

const renderTabPane = (type, tableId, content, active) => html`
  <div class="tab-pane fade ${active ? 'show active' : ''}" id="${type}-${tableId}">
    <div class="d-flex justify-content-end mb-2">
      <button class="btn btn-sm btn-outline-secondary copy-btn" data-content-id="${type}-content-${tableId}">${clipboardIcon} Copy</button>
    </div>
    <pre id="${type}-content-${tableId}"><code>${content}</code></pre>
  </div>`;

const setupCopyButtons = () => {
  const toast = new bootstrap.Toast(document.getElementById('copyToast'), { animation: true, delay: 3000 });
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const element = document.getElementById(btn.getAttribute('data-content-id'));
      if (element) {
        navigator.clipboard.writeText(element.textContent).then(() => toast.show()).catch(err => console.error('Copy failed:', err));
      }
    });
  });
};

export function renderChatMessage(role, message, useMarked = false) {
  const container = document.getElementById("chat-messages-floating");
  if (!container) return;
  
  const messageClass = role === "user" ? "bg-light text-dark" : "";
  const temp = document.createElement('div');
  render(html`
    <div class="card mb-2">
      <div class="card-body ${messageClass}">
        <p class="card-text">${useMarked ? formatChatMessageWithMarked(message) : formatChatMessage(message)}</p>
      </div>
    </div>`, temp);
  container.appendChild(temp.firstElementChild);
  container.scrollTop = container.scrollHeight;
}

const formatChatMessage = (message) => {
  const formatted = message
    .replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
  return unsafeHTML(formatted);
};

export function formatChatMessageWithMarked(message) {
  return message ? unsafeHTML(marked.parse(message)) : '';
}

export function renderRelationships(schemaData) {
  const content = document.getElementById("relationships-content");
  if (!content) return;
  
  if (!schemaData?.relationships?.length) {
    return render(loadingAlert("Analyzing relationships between tables..."), content);
  }
  
  const template = html`
    <h5>Table Relationships</h5>
    ${schemaData.relationships.map(rel => {
      const confidenceClass = rel.confidence === 'high' ? 'success' : rel.confidence === 'medium' ? 'warning' : 'secondary';
      return html`
        <div class="card mb-3">
          <div class="card-header d-flex justify-content-between align-items-center">
            <span><strong>${rel.fromTable}</strong> → <strong>${rel.toTable}</strong></span>
            <div>
              <span class="badge bg-primary">${rel.relationshipType}</span>
              <span class="badge bg-${confidenceClass}">${rel.confidence} confidence</span>
            </div>
          </div>
          <div class="card-body">
            <p><strong>Join:</strong> <code>${rel.fromTable}.${rel.fromColumn}</code> → <code>${rel.toTable}.${rel.toColumn}</code></p>
            <p><strong>Recommended Join Type:</strong> <span class="badge bg-info">${rel.joinType.toUpperCase()}</span></p>
            <p>${rel.description || 'No description available'}</p>
          </div>
        </div>`;
    })}`;
  
  render(template, content);
}

export function renderJoinsAndModeling(schemaData) {
  const content = document.getElementById("joins-content");
  if (!content) return;
  
  if (!schemaData?.suggestedJoins?.length && !schemaData?.modelingRecommendations?.length) {
    return render(loadingAlert("Analyzing join patterns and modeling recommendations..."), content);
  }
  
  const joinsTemplate = schemaData?.suggestedJoins?.length ? html`
    <h5>Suggested Join Patterns</h5>
    ${schemaData.suggestedJoins.map(join => html`
      <div class="card mb-3">
        <div class="card-header"><h6 class="mb-0">${join.description}</h6></div>
        <div class="card-body">
          <p><strong>Use Case:</strong> ${join.useCase}</p>
          <p><strong>Tables:</strong> ${join.tables.join(', ')}</p>
          <h6>SQL Pattern:</h6>
          <pre><code>${join.sqlPattern}</code></pre>
        </div>
      </div>`)}` : '';
  
  const recsTemplate = schemaData?.modelingRecommendations?.length ? html`
    <h5 class="mt-4">Data Modeling Recommendations</h5>
    <div class="alert alert-success">
      <ul class="mb-0">${schemaData.modelingRecommendations.map(rec => html`<li>${rec}</li>`)}</ul>
    </div>` : '';
  
  render(html`
    ${joinsTemplate}
    ${recsTemplate}
    ${!joinsTemplate && !recsTemplate ? loadingAlert("No join patterns or modeling recommendations available yet...") : ''}
  `, content);
}