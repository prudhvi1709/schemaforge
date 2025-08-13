/**
 * Schema Renderer
 * Handles rendering of schema-related UI components
 */

import { html, render } from 'lit-html';
import { renderEntityRelationshipDiagram } from '../diagram.js';
import { cardComponent, collapsibleComponent, buttonComponent } from '../utils/ui-components.js';
import { getElementById } from '../utils/dom-utils.js';

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
  const dbtContent = getElementById('dbt-content');
  if (dbtTab && dbtContent) {
    dbtTab.style.display = 'none';
    render(html`<div class="text-muted">Generate DBT rules first to see this content.</div>`, dbtContent);
  }
}

/**
 * Render schema overview to the UI
 * @param {Object} schemaData - Schema data to render
 */
export function renderSchemaOverview(schemaData) {
  const schemaContent = getElementById("schema-content");
  if (!schemaContent) return;
  
  if (!schemaData?.schemas?.length) {
    render(html`<div class="alert alert-info">Generating schema information...</div>`, schemaContent);
    return;
  }
  
  const schemasTemplate = html`
    <div class="d-flex justify-content-end mb-3">
      ${buttonComponent({
        text: 'Expand All',
        variant: 'outline-primary',
        size: 'sm',
        onClick: () => window.expandAllCards('schema-collapse')
      })}
    </div>
    ${schemaData.schemas.map((schema, index) => 
      renderSchemaCard(schema, index)
    )}
  `;
  
  render(schemasTemplate, schemaContent);
}

/**
 * Render individual schema card
 * @param {Object} schema - Schema object
 * @param {number} index - Schema index
 * @returns {TemplateResult} Schema card template
 */
function renderSchemaCard(schema, index) {
  const tableTypeBadge = schema.tableType ? 
    html`<span class="badge bg-secondary ms-2">${schema.tableType}</span>` : '';
  
  const primaryKeyInfo = schema.primaryKey ? 
    html`<div class="alert alert-info mt-2">
      <strong>Primary Key:</strong> ${schema.primaryKey.columns.join(', ')} 
      <span class="badge bg-primary ms-2">${schema.primaryKey.type}</span>
      <span class="badge bg-light text-dark ms-1">${schema.primaryKey.confidence} confidence</span>
    </div>` : '';
  
  const collapseId = `schema-collapse-${index}`;
  const title = html`${schema.tableName}${tableTypeBadge}`;
  
  const content = html`
    <p>${schema.description || 'No description available'}</p>
    ${primaryKeyInfo}
    <h6>Columns</h6>
    ${renderColumnsTable(schema.columns)}
  `;
  
  return html`
    <div class="card mb-3">
      <div class="card-header" role="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false" aria-controls="${collapseId}">
        <div class="d-flex justify-content-between align-items-center">
          <h5 class="mb-0">${title}</h5>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-chevron-down" viewBox="0 0 16 16">
            <path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
          </svg>
        </div>
      </div>
      <div class="collapse" id="${collapseId}">
        <div class="card-body">
          ${content}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render columns table
 * @param {Array} columns - Array of column objects
 * @returns {TemplateResult} Columns table template
 */
function renderColumnsTable(columns) {
  if (!columns || columns.length === 0) {
    return html`<p class="text-muted">No columns defined</p>`;
  }

  return html`
    <div class="table-responsive">
      <table class="table table-sm">
        <thead>
          <tr>
            <th>Column</th>
            <th>Type</th>
            <th>Nullable</th>
            <th>PII</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          ${columns.map(column => html`
            <tr>
              <td><code>${column.name}</code></td>
              <td>
                <span class="badge bg-info">${column.dataType}</span>
              </td>
              <td>
                <span class="badge ${column.nullable === false ? 'bg-danger' : 'bg-success'}">
                  ${column.nullable === false ? 'NOT NULL' : 'NULL'}
                </span>
              </td>
              <td>
                ${column.isPII ? html`<span class="badge bg-warning">PII</span>` : ''}
              </td>
              <td>${column.description || ''}</td>
            </tr>
          `)}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Render column descriptions
 * @param {Object} schemaData - Schema data
 */
export function renderColumnDescriptions(schemaData) {
  const columnsContent = getElementById("columns-content");
  if (!columnsContent) return;
  
  if (!schemaData?.schemas?.length) {
    render(html`<div class="alert alert-info">Generating column information...</div>`, columnsContent);
    return;
  }
  
  const columnsTemplate = html`
    <div class="d-flex justify-content-end mb-3">
      ${buttonComponent({
        text: 'Expand All',
        variant: 'outline-primary',
        size: 'sm',
        onClick: () => window.expandAllCards('column-collapse')
      })}
    </div>
    ${schemaData.schemas.map((schema, schemaIndex) => 
      renderColumnDescriptionCard(schema, schemaIndex)
    )}
  `;
  
  render(columnsTemplate, columnsContent);
}

/**
 * Render column description card for a table
 * @param {Object} schema - Schema object
 * @param {number} schemaIndex - Schema index
 * @returns {TemplateResult} Column description card
 */
function renderColumnDescriptionCard(schema, schemaIndex) {
  const collapseId = `column-collapse-${schemaIndex}`;
  
  const content = html`
    ${(schema.columns || []).map((column, columnIndex) => html`
      <div class="mb-3">
        <h6>
          <code>${column.name}</code>
          <span class="badge bg-info ms-2">${column.dataType}</span>
          ${column.isPII ? html`<span class="badge bg-warning ms-1">PII</span>` : ''}
          ${column.nullable === false ? html`<span class="badge bg-danger ms-1">NOT NULL</span>` : ''}
        </h6>
        <p>${column.description || 'No description available'}</p>
        
        ${column.constraints && column.constraints.length > 0 ? html`
          <div class="mt-2">
            <strong>Constraints:</strong>
            ${column.constraints.map(constraint => html`
              <span class="badge bg-secondary ms-1">${constraint}</span>
            `)}
          </div>
        ` : ''}
        
        ${column.examples && column.examples.length > 0 ? html`
          <div class="mt-2">
            <strong>Sample Values:</strong>
            <code class="ms-2">${column.examples.join(', ')}</code>
          </div>
        ` : ''}
      </div>
    `)}
  `;
  
  return html`
    <div class="card mb-3">
      <div class="card-header" role="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false" aria-controls="${collapseId}">
        <div class="d-flex justify-content-between align-items-center">
          <h5 class="mb-0">${schema.tableName}</h5>
          <small class="text-muted">${(schema.columns || []).length} columns</small>
        </div>
      </div>
      <div class="collapse" id="${collapseId}">
        <div class="card-body">
          ${content}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render relationships
 * @param {Object} schemaData - Schema data
 */
export function renderRelationships(schemaData) {
  const relationshipsContent = getElementById("relationships-content");
  if (!relationshipsContent) return;
  
  if (!schemaData?.relationships?.length) {
    render(html`<div class="alert alert-info">No relationships defined or still generating...</div>`, relationshipsContent);
    return;
  }
  
  const relationshipsTemplate = html`
    ${schemaData.relationships.map(rel => renderRelationshipCard(rel))}
  `;
  
  render(relationshipsTemplate, relationshipsContent);
}

/**
 * Render individual relationship card
 * @param {Object} relationship - Relationship object
 * @returns {TemplateResult} Relationship card
 */
function renderRelationshipCard(relationship) {
  const relationshipType = relationship.type || 'Unknown';
  const badgeClass = {
    'one-to-many': 'bg-primary',
    'many-to-one': 'bg-info',
    'one-to-one': 'bg-success',
    'many-to-many': 'bg-warning'
  }[relationshipType.toLowerCase()] || 'bg-secondary';
  
  return html`
    <div class="card mb-3">
      <div class="card-body">
        <h6 class="card-title">
          ${relationship.fromTable} → ${relationship.toTable}
          <span class="badge ${badgeClass} ms-2">${relationshipType}</span>
        </h6>
        <p class="card-text">${relationship.description}</p>
        
        ${relationship.keys ? html`
          <div class="row">
            <div class="col-6">
              <strong>From:</strong> <code>${relationship.keys.from}</code>
            </div>
            <div class="col-6">
              <strong>To:</strong> <code>${relationship.keys.to}</code>
            </div>
          </div>
        ` : ''}
        
        ${relationship.confidence ? html`
          <small class="text-muted">Confidence: ${relationship.confidence}</small>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Render joins and modeling suggestions
 * @param {Object} schemaData - Schema data
 */
export function renderJoinsAndModeling(schemaData) {
  const joinsContent = getElementById("joins-content");
  if (!joinsContent) return;
  
  const hasJoins = schemaData?.suggestedJoins?.length > 0;
  const hasModeling = schemaData?.modelingRecommendations?.length > 0;
  
  if (!hasJoins && !hasModeling) {
    render(html`<div class="alert alert-info">No joins or modeling suggestions generated yet...</div>`, joinsContent);
    return;
  }
  
  const template = html`
    ${hasJoins ? html`
      <h5>Suggested Joins</h5>
      ${schemaData.suggestedJoins.map(join => renderJoinCard(join))}
    ` : ''}
    
    ${hasModeling ? html`
      <h5 class="mt-4">Modeling Recommendations</h5>
      ${schemaData.modelingRecommendations.map(rec => renderModelingCard(rec))}
    ` : ''}
  `;
  
  render(template, joinsContent);
}

/**
 * Render join suggestion card
 * @param {Object} join - Join object
 * @returns {TemplateResult} Join card
 */
function renderJoinCard(join) {
  return html`
    <div class="card mb-3">
      <div class="card-body">
        <h6 class="card-title">
          ${join.leftTable} ${join.joinType || 'INNER'} JOIN ${join.rightTable}
        </h6>
        <p class="card-text">${join.description}</p>
        
        ${join.condition ? html`
          <code>ON ${join.condition}</code>
        ` : ''}
        
        ${join.confidence ? html`
          <div class="mt-2">
            <small class="text-muted">Confidence: ${join.confidence}</small>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Render modeling recommendation card
 * @param {Object} recommendation - Modeling recommendation
 * @returns {TemplateResult} Recommendation card
 */
function renderModelingCard(recommendation) {
  const typeClass = {
    'dimension': 'bg-info',
    'fact': 'bg-primary',
    'bridge': 'bg-warning',
    'staging': 'bg-secondary'
  }[recommendation.type?.toLowerCase()] || 'bg-light';
  
  return html`
    <div class="card mb-3">
      <div class="card-body">
        <h6 class="card-title">
          ${recommendation.table}
          ${recommendation.type ? html`
            <span class="badge ${typeClass} ms-2">${recommendation.type}</span>
          ` : ''}
        </h6>
        <p class="card-text">${recommendation.description}</p>
        
        ${recommendation.reasoning ? html`
          <small class="text-muted">
            <strong>Reasoning:</strong> ${recommendation.reasoning}
          </small>
        ` : ''}
      </div>
    </div>
  `;
}