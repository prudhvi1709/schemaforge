/**
 * Status Manager
 * Handles status messages, loading states, and UI feedback
 */

import { html, render } from 'lit-html';
import { getElementById, setElementLoading } from '../utils/dom-utils.js';
import { alertComponent } from '../utils/ui-components.js';

/**
 * Update general application status
 * @param {string} message - Status message
 * @param {string} type - Message type (info, success, warning, danger)
 */
export function updateStatus(message, type = "info") {
  const statusContainer = getElementById("status-container");
  if (!statusContainer) return;

  const statusTemplate = alertComponent(message, type);
  render(statusTemplate, statusContainer);

  // Clear success/info messages after 5 seconds
  if (type === "success" || type === "info") {
    setTimeout(() => {
      const currentAlert = statusContainer.querySelector(`.alert-${type}`);
      if (currentAlert && currentAlert.textContent.trim() === message) {
        render(html``, statusContainer);
      }
    }, 5000);
  }
}

/**
 * Update LLM configuration status
 * @param {string} message - Status message
 * @param {string} type - Message type
 */
export function updateLlmConfigStatus(message, type = "info") {
  const configContainer = getElementById("llm-config-container");
  if (!configContainer) return;

  const existingText = configContainer.querySelector(".text-muted");

  // Update status but keep the configure button
  const statusTemplate = alertComponent(message, type);

  // Remove existing status alerts
  const existingAlerts = configContainer.querySelectorAll(".alert");
  existingAlerts.forEach((alert) => alert.remove());

  // Add new status
  const tempContainer = document.createElement("div");
  render(statusTemplate, tempContainer);

  if (existingText) {
    existingText.insertAdjacentElement(
      "afterend",
      tempContainer.firstElementChild
    );
  } else {
    configContainer.appendChild(tempContainer.firstElementChild);
  }

  // Clear success/info messages after 5 seconds
  if (type === "success" || type === "info") {
    setTimeout(() => {
      const currentAlert = configContainer.querySelector(`.alert-${type}`);
      if (currentAlert && currentAlert.textContent.trim() === message) {
        currentAlert.remove();
      }
    }, 5000);
  }
}

/**
 * Set loading state for various actions
 * @param {string} action - Action identifier
 * @param {boolean} isLoading - Loading state
 */
export function setLoading(action, isLoading) {
  const actionMap = {
    "upload": "upload-spinner",
    "generate-dbt": "generate-dbt-spinner",
    "chat-floating": "chat-spinner-floating"
  };

  const spinnerId = actionMap[action] || `${action}-spinner`;
  setElementLoading(spinnerId, isLoading);
}

/**
 * Show temporary status message with auto-hide
 * @param {string} message - Message to show
 * @param {string} type - Message type
 * @param {number} duration - Duration in milliseconds
 * @param {string} containerId - Container ID (default: status-container)
 */
export function showTemporaryStatus(message, type = "info", duration = 3000, containerId = "status-container") {
  const container = getElementById(containerId);
  if (!container) return;

  const statusTemplate = alertComponent(message, type);
  render(statusTemplate, container);

  setTimeout(() => {
    const currentAlert = container.querySelector(`.alert-${type}`);
    if (currentAlert && currentAlert.textContent.trim() === message) {
      render(html``, container);
    }
  }, duration);
}

/**
 * Show loading indicator with message
 * @param {string} message - Loading message
 * @param {string} containerId - Container ID
 */
export function showLoadingStatus(message, containerId = "status-container") {
  const container = getElementById(containerId);
  if (!container) return;

  const loadingTemplate = html`
    <div class="alert alert-info">
      <div class="d-flex align-items-center">
        <div class="spinner-border spinner-border-sm me-2" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        ${message}
      </div>
    </div>
  `;

  render(loadingTemplate, container);
}

/**
 * Clear status messages
 * @param {string} containerId - Container ID
 */
export function clearStatus(containerId = "status-container") {
  const container = getElementById(containerId);
  if (container) {
    render(html``, container);
  }
}

/**
 * Status message manager for multiple concurrent statuses
 */
export class StatusManager {
  constructor(containerId) {
    this.containerId = containerId;
    this.activeStatuses = new Map();
  }

  /**
   * Add a status message with unique ID
   * @param {string} id - Unique status ID
   * @param {string} message - Status message
   * @param {string} type - Message type
   * @param {number} autoHide - Auto-hide duration (0 = no auto-hide)
   */
  addStatus(id, message, type = "info", autoHide = 0) {
    const container = getElementById(this.containerId);
    if (!container) return;

    // Store status info
    this.activeStatuses.set(id, { message, type, autoHide });

    // Re-render all statuses
    this.renderAllStatuses();

    // Setup auto-hide if specified
    if (autoHide > 0) {
      setTimeout(() => {
        this.removeStatus(id);
      }, autoHide);
    }
  }

  /**
   * Remove a specific status
   * @param {string} id - Status ID to remove
   */
  removeStatus(id) {
    this.activeStatuses.delete(id);
    this.renderAllStatuses();
  }

  /**
   * Update an existing status
   * @param {string} id - Status ID
   * @param {string} message - New message
   * @param {string} type - New type
   */
  updateStatus(id, message, type) {
    if (this.activeStatuses.has(id)) {
      const existing = this.activeStatuses.get(id);
      this.activeStatuses.set(id, { ...existing, message, type });
      this.renderAllStatuses();
    }
  }

  /**
   * Clear all statuses
   */
  clearAll() {
    this.activeStatuses.clear();
    this.renderAllStatuses();
  }

  /**
   * Render all active statuses
   */
  renderAllStatuses() {
    const container = getElementById(this.containerId);
    if (!container) return;

    if (this.activeStatuses.size === 0) {
      render(html``, container);
      return;
    }

    const statusTemplate = html`
      ${Array.from(this.activeStatuses.entries()).map(([id, status]) => 
        html`<div class="status-item" data-status-id="${id}">
          ${alertComponent(status.message, status.type)}
        </div>`
      )}
    `;

    render(statusTemplate, container);
  }
}