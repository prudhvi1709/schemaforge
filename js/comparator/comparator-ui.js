// File: js/comparator/comparator-ui.js
// UI rendering components for data comparison

import { render, html } from "lit-html";
import { $, renderLoadingSpinner } from "../utils/dom-utils.js";

/**
 * Render a group of checkboxes for column selection
 * @param {Array} columns - Column names to render
 * @param {string} className - CSS class for checkboxes
 * @param {string} idPrefix - Prefix for checkbox IDs
 * @returns {TemplateResult} Lit-html template
 */
export const renderCheckboxGroup = (columns, className, idPrefix) => columns.map(col => html`
  <div class="form-check">
    <input class="form-check-input ${className}" type="checkbox" id="${idPrefix}-${col}" value="${col}">
    <label class="form-check-label" for="${idPrefix}-${col}">${col}</label>
  </div>
`);

/**
 * Render a drill-down table for detailed data view
 * @param {Array} rows - Data rows to display
 * @param {string} title - Table title
 * @returns {TemplateResult} Lit-html template
 */
export const renderDrillTable = (rows, title) => html`
  <div class="col-md-6">
    <h6>${title} (${rows.length} rows)</h6>
    <div class="table-responsive" style="max-height: 300px;">
      <table class="table table-sm">
        <thead>
          <tr>${rows.length ? Object.keys(rows[0]).map(col => html`<th>${col}</th>`) : html`<th>No data</th>`}</tr>
        </thead>
        <tbody>
          ${rows.map(row => html`<tr>${Object.values(row).map(val => html`<td>${val}</td>`)}</tr>`)}
        </tbody>
      </table>
    </div>
  </div>
`;

/**
 * Render file status alert based on existing file data
 * @param {Object} existingFileData - Current file data from SchemaForge
 * @param {HTMLElement} container - Container element to render into
 */
export function renderFileStatus(existingFileData, container) {
  if (!container) return;

  if (existingFileData && existingFileData._originalFileContent) {
    try {
      const workbook = XLSX.read(existingFileData._originalFileContent, { type: 'array' });
      const hasMultipleSheets = workbook.SheetNames.length >= 2;

      render(html`
        <div class="alert ${hasMultipleSheets ? 'alert-success' : 'alert-warning'}">
          <i class="bi bi-${hasMultipleSheets ? 'check-circle' : 'exclamation-triangle'} me-2"></i>
          <strong>Current file loaded:</strong> ${workbook.SheetNames.length} sheet(s) available
          ${hasMultipleSheets
            ? html`<br><small>Sheets: ${workbook.SheetNames.join(', ')}</small>`
            : html`<br><small>Multiple sheets required for comparison</small>`
          }
        </div>
      `, container);
    } catch (error) {
      render(html`
        <div class="alert alert-warning">
          <i class="bi bi-exclamation-triangle me-2"></i>
          Current file cannot be processed for comparison. Please upload a new Excel file.
        </div>
      `, container);
    }
  } else {
    render(html`
      <div class="alert alert-info">
        <i class="bi bi-info-circle me-2"></i>
        No file currently loaded in SchemaForge. Upload a file first or use the 'Upload New File' option.
      </div>
    `, container);
  }
}

/**
 * Render metadata results showing column mappings and row counts
 * @param {Object} columnMapping - Column mapping data
 * @param {Object} tabData - Tab data { tab1, tab2 }
 * @param {Object} tabNames - Tab names { tab1, tab2 }
 * @param {HTMLElement} container - Container element
 */
export function renderMetadata(columnMapping, tabData, tabNames, container) {
  if (!container) return;

  const mappedColumns = columnMapping.mappings.filter(mapping =>
    mapping.dataset1_column && mapping.dataset2_column
  );

  const rowMatch = tabData.tab1.length === tabData.tab2.length;

  render(html`
    <h6>Mapped Columns (Present in Both Sheets)</h6>
    <div class="table-responsive mb-3">
      <table class="table table-sm">
        <thead>
          <tr>
            <th>${tabNames.tab1}</th>
            <th>${tabNames.tab2}</th>
            <th>Common Name</th>
            <th>Type</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          ${mappedColumns.map(mapping => html`
            <tr class="match ${mapping.data_type === 'date' || mapping.is_excel_date_serial ? 'table-warning' : ''}">
              <td>${mapping.dataset1_column}</td>
              <td>${mapping.dataset2_column}</td>
              <td><strong>${mapping.common_name}</strong> ${mapping.data_type === 'date' ? '📅' : ''}</td>
              <td>${mapping.data_type}</td>
              <td>${mapping.description}</td>
            </tr>
          `)}
        </tbody>
      </table>
    </div>

    <div class="row">
      <div class="col-md-4">
        <div class="card match">
          <div class="card-body text-center">
            <h5>${mappedColumns.length}</h5>
            <small class="text-muted">Mapped Columns</small>
          </div>
        </div>
      </div>
    </div>

    <h6 class="mt-3">Row Count Comparison</h6>
    <div class="row">
      <div class="col-md-4">
        <div class="card">
          <div class="card-body text-center">
            <h5>${tabData.tab1.length}</h5>
            <small class="text-muted">${tabNames.tab1}</small>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card">
          <div class="card-body text-center">
            <h5>${tabData.tab2.length}</h5>
            <small class="text-muted">${tabNames.tab2}</small>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card ${rowMatch ? 'match' : 'mismatch'}">
          <div class="card-body text-center">
            <h5>${rowMatch ? '✅' : '❌'}</h5>
            <small class="text-muted">Match</small>
          </div>
        </div>
      </div>
    </div>
  `, container);
}

/**
 * Render aggregation controls for column selection
 * @param {Object} columnMapping - Column mapping data
 * @param {Array} mappedCommonNames - Array of mapped common names
 * @param {HTMLElement} container - Container element
 */
export function renderAggregationControls(columnMapping, mappedCommonNames, container) {
  if (!container) return;

  const filterMapped = (suggestedColumns) =>
    (suggestedColumns || []).filter(col => mappedCommonNames.includes(col));

  render(html`
    <div class="alert alert-info mb-3">
      <i class="bi bi-info-circle me-1"></i>
      Select columns for grouping and aggregation (only showing mapped columns present in both sheets)
    </div>
    <div class="row mb-3">
      <div class="col-md-4">
        <label class="form-label fw-bold">Grouping Columns:</label>
        ${renderCheckboxGroup(filterMapped(columnMapping.suggested_grouping_columns), 'grouping-key-comparator', 'group')}
      </div>
      <div class="col-md-4">
        <label class="form-label fw-bold">Sum Columns:</label>
        ${renderCheckboxGroup(filterMapped(columnMapping.suggested_sum_columns), 'sum-column-comparator', 'sum')}
      </div>
      <div class="col-md-4">
        <label class="form-label fw-bold">Count Columns:</label>
        ${renderCheckboxGroup(filterMapped(columnMapping.suggested_count_columns), 'count-column-comparator', 'count')}
      </div>
    </div>
  `, container);
}

/**
 * Render summary comparison table
 * @param {Array} comparison - Comparison results
 * @param {Array} sumColumns - Sum column names
 * @param {Array} countColumns - Count column names
 * @param {Array} groupingKeys - Grouping key names
 * @param {Object} tabNames - Tab names { tab1, tab2 }
 * @param {Function} onRowClick - Click handler for drill-down
 * @param {HTMLElement} container - Container element
 */
export function renderSummaryComparison(comparison, sumColumns, countColumns, groupingKeys, tabNames, onRowClick, container) {
  if (!container) return;

  const groupingLabel = groupingKeys.length
    ? `(Grouped by: ${groupingKeys.join(', ')})`
    : '(Overall Total)';

  render(html`
    <h6>Summary Comparison ${groupingLabel}</h6>
    <div class="table-responsive">
      <table class="table table-sm">
        <thead>
          <tr>
            <th>Group</th>
            ${sumColumns.map(col => html`
              <th>${tabNames.tab1} ${col} (Sum)</th>
              <th>${tabNames.tab2} ${col} (Sum)</th>
            `)}
            ${countColumns.map(col => html`
              <th>${tabNames.tab1} ${col} (Count)</th>
              <th>${tabNames.tab2} ${col} (Count)</th>
            `)}
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${comparison.map(comp => html`
            <tr class="${comp.hasMismatch ? 'mismatch' : 'match'} clickable-row"
                @click=${() => onRowClick(comp)}>
              <td>${comp.group}</td>
              ${sumColumns.map(col => html`
                <td>${(comp.tab1Sums[col] || 0).toFixed(2)}</td>
                <td>${(comp.tab2Sums[col] || 0).toFixed(2)}</td>
              `)}
              ${countColumns.map(col => html`
                <td>${comp.tab1Counts[col] || 0}</td>
                <td>${comp.tab2Counts[col] || 0}</td>
              `)}
              <td>${comp.hasMismatch ? '❌ Mismatch' : '✅ Match'}</td>
            </tr>
          `)}
        </tbody>
      </table>
    </div>
    <div class="alert alert-info mt-3">
      <i class="bi bi-info-circle me-1"></i>
      Click on any row to drill down and see detailed data
    </div>
  `, container);
}

/**
 * Render drill-down view with AI analysis
 * @param {Object} summaryItem - Summary item being drilled into
 * @param {string|null} analysis - AI analysis result (null for loading state)
 * @param {Object} tabNames - Tab names { tab1, tab2 }
 * @param {Error|null} error - Error if analysis failed
 * @param {HTMLElement} container - Container element
 */
export function renderDrillDown(summaryItem, analysis, tabNames, error, container) {
  if (!container) return;

  if (error) {
    render(html`
      <div class="mt-4 p-3 border rounded">
        <h6>Drill-Down: ${summaryItem.group}</h6>
        <div class="alert alert-danger">
          <i class="bi bi-exclamation-triangle me-1"></i>
          Failed to analyze data: ${error.message}
        </div>
      </div>
    `, container);
    return;
  }

  if (!analysis) {
    render(html`
      <div class="mt-4 p-3 border rounded">
        <h6>Drill-Down: ${summaryItem.group}</h6>
        ${renderLoadingSpinner("AI is analyzing the data...")}
      </div>
    `, container);
    return;
  }

  render(html`
    <div class="mt-4 p-3 border rounded">
      <h6>Drill-Down: ${summaryItem.group}</h6>
      <div class="alert ${summaryItem.hasMismatch ? 'alert-warning' : 'alert-success'} mb-3">
        <h6><i class="bi bi-robot me-1"></i>AI Analysis</h6>
        <p class="mb-0">${analysis}</p>
      </div>
      <div class="row">
        ${renderDrillTable(summaryItem.tab1Rows, tabNames.tab1)}
        ${renderDrillTable(summaryItem.tab2Rows, tabNames.tab2)}
      </div>
    </div>
  `, container);
}
