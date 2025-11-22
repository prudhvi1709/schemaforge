// File: js/utils/dom-utils.js
// Shared DOM utility functions for SchemaForge

import { html, render } from "lit-html";

/**
 * Get DOM element by ID (shorthand selector)
 * @param {string} id - Element ID
 * @returns {HTMLElement|null}
 */
export const $ = (id) => document.getElementById(id);

/**
 * Show elements by removing d-none class
 * @param {...string} ids - Element IDs to show
 */
export const showElements = (...ids) =>
  ids.forEach(id => $(id)?.classList.remove("d-none"));

/**
 * Hide elements by adding d-none class
 * @param {...string} ids - Element IDs to hide
 */
export const hideElements = (...ids) =>
  ids.forEach(id => $(id)?.classList.add("d-none"));

/**
 * Toggle loading state on a button with spinner
 * @param {string} action - Action identifier (e.g., "upload", "generate-dbt", "chat-floating")
 * @param {boolean} isLoading - Whether to show loading state
 */
export function setLoading(action, isLoading) {
  const spinnerId = action === "chat-floating" ? "chat-spinner-floating" : `${action}-spinner`;
  const spinner = $(spinnerId);
  const button = spinner?.closest("button");

  if (spinner && button) {
    spinner.classList.toggle("d-none", !isLoading);
    button.disabled = isLoading;
  }
}

/**
 * Display status message with auto-dismiss for success/info types
 * @param {string} message - Message to display
 * @param {string} type - Alert type (info, success, warning, danger)
 * @param {string} containerId - ID of container element (default: "status-container")
 * @param {number} dismissDelay - Auto-dismiss delay in ms (default: 5000)
 */
export function updateStatus(message, type = "info", containerId = "status-container", dismissDelay = 5000) {
  const container = $(containerId);
  if (!container) return;

  render(html`<div class="alert alert-${type} mt-3">${message}</div>`, container);

  if (type === "success" || type === "info") {
    setTimeout(() => {
      const alert = container.querySelector(`.alert-${type}`);
      if (alert && alert.textContent.trim() === message) {
        render(html``, container);
      }
    }, dismissDelay);
  }
}

/**
 * Render loading spinner with message
 * @param {string} message - Loading message
 * @returns {TemplateResult} Lit-html template
 */
export const renderLoadingSpinner = (message = "Processing...") => html`
  <div class="d-flex justify-content-center">
    <div class="spinner-border text-primary" role="status"></div>
    <span class="ms-2">${message}</span>
  </div>
`;

/**
 * Render content to an element with optional fallback loading message
 * @param {string} elementId - Target element ID
 * @param {TemplateResult|null} template - Lit-html template to render
 * @param {string} fallbackMsg - Loading message if template is null
 */
export function renderContent(elementId, template, fallbackMsg = "Loading...") {
  const content = $(elementId);
  if (!content) return;

  const loadingTemplate = html`<div class="alert alert-info">${fallbackMsg}</div>`;
  render(template || loadingTemplate, content);
}

/**
 * Create a Bootstrap alert element and append to container
 * @param {HTMLElement} container - Container element
 * @param {string} message - Alert message
 * @param {string} type - Alert type
 * @param {boolean} autoDismiss - Whether to auto-dismiss
 * @param {number} delay - Auto-dismiss delay in ms
 */
export function appendAlert(container, message, type = "info", autoDismiss = true, delay = 5000) {
  const tempContainer = document.createElement("div");
  render(html`<div class="alert alert-${type} mt-2">${message}</div>`, tempContainer);
  container.appendChild(tempContainer.firstElementChild);

  if (autoDismiss && (type === "success" || type === "info")) {
    setTimeout(() => {
      const alert = container.querySelector(`.alert-${type}`);
      if (alert && alert.textContent.trim() === message) {
        alert.remove();
      }
    }, delay);
  }
}
