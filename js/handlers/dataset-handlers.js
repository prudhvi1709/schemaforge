// File: js/handlers/dataset-handlers.js
// Sample dataset loading and viewing handlers extracted from main.js

import { html, render } from "lit-html";
import { parseFileFromUrl } from "../file-parser.js";
import { $, setLoading, updateStatus } from "../utils/dom-utils.js";

/**
 * Handle click on sample datasets button - load datasets if not already loaded
 */
export function handleSampleDatasetsClick() {
  const container = $('sample-datasets-container');
  if (container && container.querySelectorAll('.sample-dataset-card').length === 0) {
    loadSampleDatasets();
  }
}

/**
 * Load and render sample datasets from config.json
 */
export async function loadSampleDatasets() {
  const config = await (await fetch('./config.json')).json();
  const container = $('sample-datasets-container');
  const datasets = config.demos || [];

  render(html`${datasets.map(dataset => html`
    <div class="col-md-6 col-lg-4 mb-3">
      <div class="card h-100 sample-dataset-card"
           data-url="${dataset.href}"
           data-title="${dataset.title}"
           style="cursor: pointer; transition: transform 0.2s; position: relative;">
        <div class="card-body">
          <h5 class="card-title">${dataset.title}</h5>
          <p class="card-text text-muted">${dataset.body}</p>
        </div>
        <div class="card-footer d-flex justify-content-between align-items-center bg-transparent border-0">
          <small class="text-muted">Click to analyze</small>
          <button class="btn btn-outline-primary btn-sm view-dataset-btn"
                  data-url="${dataset.href}"
                  data-title="${dataset.title}"
                  title="View dataset in browser">
            <i class="bi bi-eye"></i> View
          </button>
        </div>
      </div>
    </div>
  `)}`, container);

  // Setup card click handlers
  container.querySelectorAll('.sample-dataset-card').forEach(card => {
    card.addEventListener('click', (e) => handleSampleDatasetClick(e));

    // Hover effects
    ['mouseenter', 'mouseleave'].forEach((event, i) => {
      card.addEventListener(event, () => {
        card.style.transform = i ? 'translateY(0)' : 'translateY(-2px)';
        card.style.boxShadow = i ? 'none' : '0 4px 8px rgba(0,0,0,0.1)';
      });
    });
  });

  // Setup view button handlers
  container.querySelectorAll('.view-dataset-btn').forEach(btn => {
    btn.addEventListener('click', handleViewDatasetClick);
  });
}

/**
 * Handle click on view dataset button
 * @param {Event} event - Click event
 */
export function handleViewDatasetClick(event) {
  event.stopPropagation(); // Prevent card click
  const { url, title } = event.currentTarget.dataset;

  if (!url) {
    updateStatus("No URL available for this dataset", "warning");
    return;
  }

  const extension = url.split('.').pop().toLowerCase();

  if (extension === 'csv') {
    // For CSV files, open directly (most reliable)
    window.open(url, '_blank', 'noopener,noreferrer');
    updateStatus(`Opening ${title} (CSV) in new tab...`, "info");
  } else {
    // For Excel and other files, use Office viewer
    const viewerUrl = generateViewerUrl(url);
    window.open(viewerUrl, '_blank', 'noopener,noreferrer');
    updateStatus(`Opening ${title} in new tab...`, "info");
  }
}

/**
 * Generate viewer URL for file
 * @param {string} fileUrl - URL of the file
 * @returns {string} Viewer URL
 */
export function generateViewerUrl(fileUrl) {
  const encodedUrl = encodeURIComponent(fileUrl);
  const extension = fileUrl.split('.').pop().toLowerCase();

  switch (extension) {
    case 'xlsx':
    case 'xls':
      // Use Microsoft Office Web Viewer for Excel files
      return `https://view.officeapps.live.com/op/view.aspx?src=${encodedUrl}`;
    case 'csv':
      // CSV files opened directly
      return fileUrl;
    default:
      // Try Office viewer for other formats
      return `https://view.officeapps.live.com/op/view.aspx?src=${encodedUrl}`;
  }
}

/**
 * Handle click on sample dataset card to analyze
 * @param {Event} event - Click event
 * @param {Object} context - Context object { llmConfig, processFile }
 */
export async function handleSampleDatasetClick(event, context = {}) {
  // Check if the click was on the view button
  if (event.target.closest('.view-dataset-btn')) {
    return;
  }

  const { url, title } = event.currentTarget.dataset;
  const { llmConfig, processFile } = context;

  // Get llmConfig from window if not provided
  const config = llmConfig || window.getLLMConfig?.();

  if (!url || !config) {
    updateStatus("Please configure LLM settings first", "warning");
    return;
  }

  const card = event.currentTarget;
  card.style.opacity = '0.6';
  card.style.pointerEvents = 'none';
  setLoading("upload", true);
  updateStatus(`Loading ${title}...`, "info");

  try {
    const fileData = await parseFileFromUrl(url, title);

    // Use provided processFile or get from window
    const processFn = processFile || window.processSchemaForgeFile;
    if (processFn) {
      await processFn(fileData, title);
    }
  } catch (error) {
    updateStatus(`Error loading ${title}: ${error.message}`, "danger");
  } finally {
    setLoading("upload", false);
    card.style.opacity = '1';
    card.style.pointerEvents = 'auto';
  }
}

/**
 * Expand all collapsible cards with given prefix
 * @param {string} prefix - ID prefix for cards to expand
 */
export function expandAllCards(prefix) {
  document.querySelectorAll(`[id^="${prefix}"]`).forEach(el => {
    if (el.classList.contains('collapse') && !el.classList.contains('show')) {
      new bootstrap.Collapse(el, { toggle: false }).show();
      document.querySelector(`[data-bs-target="#${el.id}"]`)?.setAttribute('aria-expanded', 'true');
    }
  });
}
