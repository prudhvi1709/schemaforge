import { html, render } from 'lit-html';
import { unsafeHTML } from 'lit-html/directives/unsafe-html.js';
import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
import { renderEntityRelationshipDiagram } from './diagram.js';

// Initialize Marked for markdown parsing
const marked = new Marked();

/**
 * Render only schema results (without DBT rules)
 * @param {Object} schemaData - Generated schema information
 */
export function renderSchemaResults(schemaData) {
  // Render all schema-related tabs
  renderSchemaOverview(schemaData);
  renderColumnDescriptions(schemaData);
  renderRelationships(schemaData);
  renderJoinsAndModeling(schemaData);
  renderEntityRelationshipDiagram(schemaData);
  
  // Hide the DBT tab initially
  const dbtTab = document.querySelector('[data-bs-target="#dbt-tab"]');
  const dbtContent = document.getElementById('dbt-content');
  if (dbtTab && dbtContent) {
    dbtTab.style.display = 'none';
    render(html`<div class="text-muted">Generate DBT rules first to see this content.</div>`, dbtContent);
  }
}

/**
 * Render complete results including schema and DBT rules
 * @param {Object} schemaData - Generated schema information  
 * @param {Object} dbtRulesData - Generated DBT rules
 */
export function renderResults(schemaData, dbtRulesData) {
  renderSchemaResults(schemaData);
  renderDbtRules(dbtRulesData);
  
  // Show the DBT tab when rules are generated
  const dbtTab = document.querySelector('[data-bs-target="#dbt-tab"]');
  if (dbtTab) {
    dbtTab.style.display = 'block';
  }
}

// All needed functions are exported individually with the 'export' keyword

/**
 * Render schema overview to the UI
 * @param {Object} schemaData - Schema data to render
 */
export function renderSchemaOverview(schemaData) {
  const schemaContent = document.getElementById("schema-content");
  
  if (!schemaData?.schemas?.length) {
    render(html`<div class="alert alert-info">Generating schema information...</div>`, schemaContent);
    return;
  }
  
  const schemasTemplate = html`
    ${schemaData.schemas.map((schema, index) => {
      const tableTypeBadge = schema.tableType ? 
        html`<span class="badge bg-secondary ms-2">${schema.tableType}</span>` : '';
      
      const primaryKeyInfo = schema.primaryKey ? 
        html`<div class="alert alert-info mt-2">
          <strong>Primary Key:</strong> ${schema.primaryKey.columns.join(', ')} 
          <span class="badge bg-primary ms-2">${schema.primaryKey.type}</span>
          <span class="badge bg-light text-dark ms-1">${schema.primaryKey.confidence} confidence</span>
        </div>` : '';
      
      const collapseId = `schema-collapse-${index}`;
      
      return html`
        <div class="card mb-3">
          <div class="card-header" role="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false" aria-controls="${collapseId}">
            <div class="d-flex justify-content-between align-items-center">
              <h5 class="mb-0">${schema.tableName}${tableTypeBadge}</h5>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-chevron-down" viewBox="0 0 16 16">
                <path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
              </svg>
            </div>
          </div>
          <div class="collapse" id="${collapseId}">
            <div class="card-body">
              <p>${schema.description || 'No description available'}</p>
              ${primaryKeyInfo}
              <h6>Columns</h6>
              <div class="table-responsive">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Description</th>
                      <th>Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${schema.columns?.map(col => {
                      const flags = [];
                      if (col.isPrimaryKey) flags.push(html`<span class="badge bg-warning text-dark">PK</span>`);
                      if (col.isForeignKey) flags.push(html`<span class="badge bg-info">FK</span>`);
                      if (col.isPII) flags.push(html`<span class="badge bg-danger">PII</span>`);
                      
                      return html`
                        <tr>
                          <td>${col.name}</td>
                          <td><code>${col.dataType}</code></td>
                          <td>${col.description || 'Generating description...'}</td>
                          <td>${flags}</td>
                        </tr>
                      `;
                    }) || html`<tr><td colspan="4">Loading column information...</td></tr>`}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      `;
    })}
  `;
  
  render(schemasTemplate, schemaContent);
}

/**
 * Render column descriptions to the UI
 * @param {Object} schemaData - Schema data to render
 */
export function renderColumnDescriptions(schemaData) {
  const columnsContent = document.getElementById("columns-content");
  
  if (!schemaData?.schemas?.length) {
    render(html`<div class="alert alert-info">Generating column descriptions...</div>`, columnsContent);
    return;
  }
  
  const columnsTemplate = html`
    ${schemaData.schemas.map((schema, schemaIdx) => html`
      <h5>${schema.tableName}</h5>
      ${schema.columns?.map((column, colIdx) => {
        const badges = [];
        if (column.isPrimaryKey) badges.push(html`<span class="badge bg-warning text-dark">Primary Key</span>`);
        if (column.isForeignKey) badges.push(html`<span class="badge bg-info">Foreign Key</span>`);
        if (column.isPII) badges.push(html`<span class="badge bg-danger">PII/Sensitive</span>`);
        if (!column.isPII) badges.push(html`<span class="badge bg-success">Not Sensitive</span>`);
        
        const foreignKeyInfo = column.foreignKeyReference ? html`
          <div class="alert alert-info mt-2">
            <strong>Foreign Key Reference:</strong><br>
            References: <code>${column.foreignKeyReference.referencedTable}.${column.foreignKeyReference.referencedColumn}</code>
            <span class="badge bg-light text-dark ms-2">${column.foreignKeyReference.confidence} confidence</span>
          </div>
        ` : '';
        
        const collapseId = `column-collapse-${schemaIdx}-${colIdx}`;
        
        return html`
          <div class="card mb-2">
            <div class="card-header d-flex justify-content-between align-items-center" role="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false" aria-controls="${collapseId}">
              <span><strong>${column.name}</strong> <code class="ms-2">${column.dataType}</code></span>
              <div class="d-flex align-items-center">
                <div class="me-2">${badges}</div>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-chevron-down" viewBox="0 0 16 16">
                  <path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
                </svg>
              </div>
            </div>
            <div class="collapse" id="${collapseId}">
              <div class="card-body">
                <p>${column.description || 'No description available'}</p>
                
                ${foreignKeyInfo}
                
                ${column.qualityObservations?.length ? html`
                  <h6>Data Quality Observations</h6>
                  <ul>
                    ${column.qualityObservations.map(obs => html`<li>${obs}</li>`)}
                  </ul>
                ` : ''}
                
                ${column.constraints?.length ? html`
                  <h6>Constraints</h6>
                  <ul>
                    ${column.constraints.map(constraint => html`<li>${constraint}</li>`)}
                  </ul>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      }) || html`<div class="alert alert-info">Loading column details...</div>`}
    `)}
  `;
  
  render(columnsTemplate, columnsContent);
}

/**
 * Show loading indicator in the chat for DBT rule generation
 * @param {Boolean} isLoading - Whether to show or hide the loading indicator
 */
export function showDbtRuleLoadingIndicator(isLoading) {
  const chatContainer = document.getElementById("chat-messages-floating");
  
  if (!chatContainer) return;
  
  // Check if loading indicator already exists
  let loadingIndicator = document.getElementById("dbt-rule-loading-indicator");
  
  if (isLoading && !loadingIndicator) {
    // Create loading indicator
    loadingIndicator = document.createElement("div");
    loadingIndicator.id = "dbt-rule-loading-indicator";
    loadingIndicator.className = "card mb-2";
    
    render(
      html`
        <div class="card-body">
          <div class="d-flex align-items-center">
            <div class="spinner-border spinner-border-sm me-2" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
            <p class="card-text mb-0">Processing DBT rule changes...</p>
          </div>
        </div>
      `,
      loadingIndicator
    );
    
    chatContainer.appendChild(loadingIndicator);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  } else if (!isLoading && loadingIndicator) {
    // Remove loading indicator
    loadingIndicator.remove();
  }
}

/**
 * Render DBT rules to the UI
 * @param {Object} dbtRulesData - DBT rules data to render
 */
export function renderDbtRules(dbtRulesData) {
  const dbtContent = document.getElementById("dbt-content");
  
  if (!dbtContent) {
    console.error("DBT content element not found");
    return;
  }
  
  if (!dbtRulesData?.dbtRules?.length) {
    render(html`<div class="alert alert-info">Generating DBT rules...</div>`, dbtContent);
    return;
  }
  
  // Process the summary text to convert it into markdown bullet points if it's not already
  let summaryContent = '';
  if (dbtRulesData.summary) {
    // Check if the summary is already in bullet point format
    if (!dbtRulesData.summary.includes('- ') && !dbtRulesData.summary.includes('* ')) {
      // Split by sentences and create bullet points
      const sentences = dbtRulesData.summary
        .replace(/([.!?])\s+/g, "$1\n")
        .split('\n')
        .filter(s => s.trim().length > 0);
      
      summaryContent = sentences.map(s => `- ${s}`).join('\n');
    } else {
      // Already has bullet points, keep as is
      summaryContent = dbtRulesData.summary;
    }
  }
  
  const dbtTemplate = html`
    ${dbtRulesData.summary ? html`
      <div class="alert alert-primary mb-4">
        <h5>DBT Rules Summary</h5>
        ${formatChatMessageWithMarked(summaryContent)}
      </div>
    ` : ''}
    
    ${dbtRulesData.globalRecommendations?.length ? html`
      <div class="alert alert-success mb-4">
        <h6>Global DBT Project Recommendations</h6>
        <ul class="mb-0">
          ${dbtRulesData.globalRecommendations.map(rec => html`<li>${rec}</li>`)}
        </ul>
      </div>
    ` : ''}
    
    <!-- Toast container for copy notifications -->
    <div class="position-fixed top-0 end-0 p-3" style="z-index: 1080">
      <div id="copyToast" class="toast align-items-center text-white bg-success" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
          <div class="toast-body">
            Content copied to clipboard!
          </div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
      </div>
    </div>
    
    ${dbtRulesData.dbtRules.map(rule => {
      const materializationBadge = rule.materialization ? 
        html`<span class="badge bg-info ms-2">${rule.materialization}</span>` : '';
      
      const tableId = rule.tableName.replace(/\s/g, '_');
      
      return html`
        <div class="card mb-3">
          <div class="card-header">
            <h5 class="mb-0">${rule.tableName}${materializationBadge}</h5>
          </div>
          <div class="card-body">
            <ul class="nav nav-tabs" id="rule-tabs-${tableId}">
              <li class="nav-item">
                <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#sql-${tableId}">SQL</button>
              </li>
              <li class="nav-item">
                <button class="nav-link" data-bs-toggle="tab" data-bs-target="#yaml-${tableId}">YAML</button>
              </li>
              <li class="nav-item">
                <button class="nav-link" data-bs-toggle="tab" data-bs-target="#tests-${tableId}">Tests</button>
              </li>
              ${rule.relationships?.length ? html`
              <li class="nav-item">
                <button class="nav-link" data-bs-toggle="tab" data-bs-target="#relationships-${tableId}">Relationships</button>
              </li>
              ` : ''}
            </ul>
            
            <div class="tab-content mt-3">
              <div class="tab-pane fade show active" id="sql-${tableId}">
                <div class="d-flex justify-content-end mb-2">
                  <button class="btn btn-sm btn-outline-secondary copy-btn" data-content-id="sql-content-${tableId}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-clipboard" viewBox="0 0 16 16">
                      <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                      <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
                    </svg>
                    Copy
                  </button>
                </div>
                <pre id="sql-content-${tableId}"><code>${rule.modelSql || 'Generating SQL...'}</code></pre>
              </div>
              <div class="tab-pane fade" id="yaml-${tableId}">
                <div class="d-flex justify-content-end mb-2">
                  <button class="btn btn-sm btn-outline-secondary copy-btn" data-content-id="yaml-content-${tableId}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-clipboard" viewBox="0 0 16 16">
                      <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                      <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
                    </svg>
                    Copy
                  </button>
                </div>
                <pre id="yaml-content-${tableId}"><code>${rule.yamlConfig || 'Generating YAML config...'}</code></pre>
              </div>
              <div class="tab-pane fade" id="tests-${tableId}">
                ${rule.tests?.length ? html`
                  <table class="table table-sm">
                    <thead>
                      <tr>
                        <th>Column</th>
                        <th>Tests</th>
                        <th>Relationships</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${rule.tests.map(test => html`
                        <tr>
                          <td>${test.column}</td>
                          <td>
                            <ul class="mb-0">
                              ${test.tests?.map(t => html`<li>${t}</li>`) || html`<li>Loading tests...</li>`}
                            </ul>
                          </td>
                          <td>
                            ${test.relationships?.length ? html`
                              <ul class="mb-0">
                                ${test.relationships.map(rel => html`
                                  <li><code>${rel.test}</code> → ${rel.to} (${rel.field})</li>
                                `)}
                              </ul>
                            ` : html`<span class="text-muted">None</span>`}
                          </td>
                        </tr>
                      `)}
                    </tbody>
                  </table>
                ` : html`<div class="alert alert-info">Generating tests...</div>`}
                
                ${rule.recommendations?.length ? html`
                  <h6 class="mt-3">Model-Specific Recommendations</h6>
                  <ul>
                    ${rule.recommendations.map(rec => html`<li>${rec}</li>`)}
                  </ul>
                ` : ''}
              </div>
              
              ${rule.relationships?.length ? html`
              <div class="tab-pane fade" id="relationships-${tableId}">
                <div class="d-flex justify-content-end mb-2">
                  <button class="btn btn-sm btn-outline-secondary copy-btn" data-content-id="relationships-content-${tableId}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-clipboard" viewBox="0 0 16 16">
                      <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                      <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
                    </svg>
                    Copy
                  </button>
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
                    </div>
                  `)}
                </div>
              </div>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    })}
  `;
  
  render(dbtTemplate, dbtContent);
  
  // Create toast instance
  const toastEl = document.getElementById('copyToast');
  if (toastEl) {
    const toastOptions = {
      animation: true,
      delay: 3000
    };
    const toastInstance = new bootstrap.Toast(toastEl, toastOptions);
    
    // Add event listeners to copy buttons after rendering
    document.querySelectorAll('.copy-btn').forEach(button => {
      button.addEventListener('click', () => {
        const contentId = button.getAttribute('data-content-id');
        const contentElement = document.getElementById(contentId);
        if (contentElement) {
          // Get text content from the element
          const text = contentElement.textContent;
          
          // Copy to clipboard
          navigator.clipboard.writeText(text).then(() => {
            // Show toast notification
            toastInstance.show();
          }).catch(err => {
            console.error('Failed to copy: ', err);
          });
        }
      });
    });
  }
}

/**
 * Render a chat message to the UI
 * @param {String} role - Message sender role ('user', 'assistant', or 'system')
 * @param {String} message - Message content
 * @param {Boolean} useMarked - Whether to use Marked for markdown parsing (for chat only)
 */
export function renderChatMessage(role, message, useMarked = false) {
  // Get the floating chat container
  const chatContainer = document.getElementById("chat-messages-floating");
  if (!chatContainer) return;
  
  const messageClass = role === "user" ? "bg-light text-dark" : "";
  
  const messageTemplate = html`
    <div class="card mb-2">
      <div class="card-body ${messageClass}">
        <p class="card-text">
          ${useMarked ? formatChatMessageWithMarked(message) : formatChatMessage(message)}
        </p>
      </div>
    </div>
  `;
  
  // Add to chat container
  const tempContainer = document.createElement('div');
  render(messageTemplate, tempContainer);
  chatContainer.appendChild(tempContainer.firstElementChild);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

/**
 * Format chat message content with markdown-like features
 * @param {String} message - Raw message content
 * @returns {TemplateResult} Formatted message template
 */
function formatChatMessage(message) {
  // Replace code blocks
  let formatted = message.replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>');
  
  // Replace inline code
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Replace newlines with breaks
  formatted = formatted.replace(/\n/g, '<br>');
  
  // Return as unsafe HTML since we're doing manual formatting
  return unsafeHTML(formatted);
}

/**
 * Format chat message content with Marked markdown parser
 * @param {String} message - Raw message content
 * @returns {TemplateResult} Formatted message template
 */
export function formatChatMessageWithMarked(message) {
  if (!message) return '';
  
  // Use Marked to parse markdown
  const parsedMarkdown = marked.parse(message);
  
  // Return as unsafe HTML since it's been parsed by Marked
  return unsafeHTML(parsedMarkdown);
}

/**
 * Render relationships information to the UI
 * @param {Object} schemaData - Schema data containing relationships
 */
export function renderRelationships(schemaData) {
  const relationshipsContent = document.getElementById("relationships-content");
  
  if (!relationshipsContent) {
    console.warn("Relationships content element not found - will be created by HTML update");
    return;
  }
  
  if (!schemaData?.relationships?.length) {
    render(html`<div class="alert alert-info">Analyzing relationships between tables...</div>`, relationshipsContent);
    return;
  }
  
  const relationshipsTemplate = html`
    <h5>Table Relationships</h5>
    ${schemaData.relationships.map(rel => {
      const confidenceClass = rel.confidence === 'high' ? 'success' : 
                             rel.confidence === 'medium' ? 'warning' : 'secondary';
      
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
        </div>
      `;
    })}
  `;
  
  render(relationshipsTemplate, relationshipsContent);
}

/**
 * Render joins and modeling recommendations to the UI
 * @param {Object} schemaData - Schema data containing joins and recommendations
 */
export function renderJoinsAndModeling(schemaData) {
  const joinsContent = document.getElementById("joins-content");
  
  if (!joinsContent) {
    console.warn("Joins content element not found - will be created by HTML update");
    return;
  }
  
  if (!schemaData?.suggestedJoins?.length && !schemaData?.modelingRecommendations?.length) {
    render(html`<div class="alert alert-info">Analyzing join patterns and modeling recommendations...</div>`, joinsContent);
    return;
  }
  
  const suggestedJoinsTemplate = schemaData?.suggestedJoins?.length ? html`
    <h5>Suggested Join Patterns</h5>
    ${schemaData.suggestedJoins.map(join => html`
      <div class="card mb-3">
        <div class="card-header">
          <h6 class="mb-0">${join.description}</h6>
        </div>
        <div class="card-body">
          <p><strong>Use Case:</strong> ${join.useCase}</p>
          <p><strong>Tables:</strong> ${join.tables.join(', ')}</p>
          <h6>SQL Pattern:</h6>
          <pre><code>${join.sqlPattern}</code></pre>
        </div>
      </div>
    `)}
  ` : '';
  
  const modelingRecommendationsTemplate = schemaData?.modelingRecommendations?.length ? html`
    <h5 class="mt-4">Data Modeling Recommendations</h5>
    <div class="alert alert-success">
      <ul class="mb-0">
        ${schemaData.modelingRecommendations.map(rec => html`<li>${rec}</li>`)}
      </ul>
    </div>
  ` : '';
  
  const joinsTemplate = html`
    ${suggestedJoinsTemplate}
    ${modelingRecommendationsTemplate}
    ${!suggestedJoinsTemplate && !modelingRecommendationsTemplate ? 
      html`<div class="alert alert-info">No join patterns or modeling recommendations available yet...</div>` : ''}
  `;
  
  render(joinsTemplate, joinsContent);
}