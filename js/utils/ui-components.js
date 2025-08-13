/**
 * Reusable UI Components
 * Shared templates and component utilities using lit-html
 */

import { html } from 'lit-html';

/**
 * Alert component with auto-dismiss
 * @param {string} message - Alert message
 * @param {string} type - Alert type (success, danger, warning, info)
 * @param {boolean} dismissible - Whether alert can be dismissed
 * @returns {TemplateResult} Alert template
 */
export function alertComponent(message, type = 'info', dismissible = false) {
  return html`
    <div class="alert alert-${type} ${dismissible ? 'alert-dismissible' : ''}" role="alert">
      ${message}
      ${dismissible ? html`
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      ` : ''}
    </div>
  `;
}

/**
 * Loading spinner component
 * @param {string} size - Spinner size (sm, default)
 * @param {string} text - Loading text
 * @returns {TemplateResult} Spinner template
 */
export function loadingSpinner(size = '', text = 'Loading...') {
  const sizeClass = size ? `spinner-border-${size}` : '';
  return html`
    <div class="d-flex align-items-center">
      <div class="spinner-border ${sizeClass} me-2" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
      ${text}
    </div>
  `;
}

/**
 * Card component with optional header and footer
 * @param {Object} options - Card options
 * @param {string} options.title - Card title
 * @param {TemplateResult} options.content - Card body content
 * @param {TemplateResult} options.footer - Card footer content
 * @param {string} options.headerClass - Additional header classes
 * @param {string} options.bodyClass - Additional body classes
 * @returns {TemplateResult} Card template
 */
export function cardComponent({
  title,
  content,
  footer,
  headerClass = '',
  bodyClass = ''
}) {
  return html`
    <div class="card">
      ${title ? html`
        <div class="card-header ${headerClass}">
          <h5 class="mb-0">${title}</h5>
        </div>
      ` : ''}
      <div class="card-body ${bodyClass}">
        ${content}
      </div>
      ${footer ? html`
        <div class="card-footer">
          ${footer}
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Button component with loading state
 * @param {Object} options - Button options
 * @param {string} options.text - Button text
 * @param {string} options.type - Button type (button, submit)
 * @param {string} options.variant - Button variant (primary, secondary, etc.)
 * @param {string} options.size - Button size (sm, lg)
 * @param {boolean} options.loading - Loading state
 * @param {boolean} options.disabled - Disabled state
 * @param {string} options.id - Button ID
 * @param {Function} options.onClick - Click handler
 * @returns {TemplateResult} Button template
 */
export function buttonComponent({
  text,
  type = 'button',
  variant = 'primary',
  size = '',
  loading = false,
  disabled = false,
  id = '',
  onClick
}) {
  const sizeClass = size ? `btn-${size}` : '';
  const buttonId = id ? `id="${id}"` : '';
  
  return html`
    <button 
      type="${type}" 
      class="btn btn-${variant} ${sizeClass}" 
      ?disabled=${disabled || loading}
      @click=${onClick}
      ${buttonId}
    >
      ${loading ? html`
        <span class="spinner-border spinner-border-sm me-1" role="status">
          <span class="visually-hidden">Loading...</span>
        </span>
      ` : ''}
      ${text}
    </button>
  `;
}

/**
 * Tab navigation component
 * @param {Array} tabs - Array of tab objects {id, label, content, active}
 * @param {string} tabsId - Unique ID for tab group
 * @returns {TemplateResult} Tabs template
 */
export function tabsComponent(tabs, tabsId) {
  return html`
    <ul class="nav nav-tabs" id="${tabsId}-tabs" role="tablist">
      ${tabs.map(tab => html`
        <li class="nav-item" role="presentation">
          <button 
            class="nav-link ${tab.active ? 'active' : ''}" 
            id="${tab.id}-tab" 
            data-bs-toggle="tab" 
            data-bs-target="#${tab.id}" 
            type="button" 
            role="tab" 
            aria-controls="${tab.id}" 
            aria-selected="${tab.active ? 'true' : 'false'}"
          >
            ${tab.label}
          </button>
        </li>
      `)}
    </ul>
    
    <div class="tab-content mt-3" id="${tabsId}-content">
      ${tabs.map(tab => html`
        <div 
          class="tab-pane fade ${tab.active ? 'show active' : ''}" 
          id="${tab.id}" 
          role="tabpanel" 
          aria-labelledby="${tab.id}-tab"
        >
          ${tab.content}
        </div>
      `)}
    </div>
  `;
}

/**
 * Form field component
 * @param {Object} options - Field options
 * @param {string} options.type - Input type
 * @param {string} options.id - Field ID
 * @param {string} options.label - Field label
 * @param {string} options.placeholder - Placeholder text
 * @param {string} options.value - Field value
 * @param {boolean} options.required - Whether field is required
 * @param {string} options.helpText - Help text
 * @param {Array} options.options - Select options (for select fields)
 * @returns {TemplateResult} Form field template
 */
export function formFieldComponent({
  type = 'text',
  id,
  label,
  placeholder = '',
  value = '',
  required = false,
  helpText = '',
  options = []
}) {
  const fieldClass = type === 'select' ? 'form-select' : 'form-control';
  
  return html`
    <div class="mb-3">
      ${label ? html`
        <label for="${id}" class="form-label">
          ${label} ${required ? html`<span class="text-danger">*</span>` : ''}
        </label>
      ` : ''}
      
      ${type === 'select' ? html`
        <select class="${fieldClass}" id="${id}" ?required=${required}>
          ${placeholder ? html`<option value="">${placeholder}</option>` : ''}
          ${options.map(option => html`
            <option value="${option.value}" ?selected=${option.value === value}>
              ${option.label}
            </option>
          `)}
        </select>
      ` : type === 'textarea' ? html`
        <textarea 
          class="${fieldClass}" 
          id="${id}" 
          placeholder="${placeholder}"
          ?required=${required}
          rows="3"
        >${value}</textarea>
      ` : html`
        <input 
          type="${type}" 
          class="${fieldClass}" 
          id="${id}" 
          placeholder="${placeholder}"
          value="${value}"
          ?required=${required}
        />
      `}
      
      ${helpText ? html`
        <div class="form-text">${helpText}</div>
      ` : ''}
    </div>
  `;
}

/**
 * Status message component with auto-dismiss timer
 * @param {string} message - Status message
 * @param {string} type - Message type
 * @param {number} autoHideDelay - Auto-hide delay in ms (0 = no auto-hide)
 * @returns {TemplateResult} Status template
 */
export function statusComponent(message, type = 'info', autoHideDelay = 0) {
  const template = alertComponent(message, type);
  
  // Auto-hide logic for success/info messages
  if (autoHideDelay > 0 && (type === 'success' || type === 'info')) {
    setTimeout(() => {
      // This would need to be handled by the calling component
      // by re-rendering with empty content
    }, autoHideDelay);
  }
  
  return template;
}

/**
 * Code block component with copy functionality
 * @param {string} code - Code content
 * @param {string} language - Programming language
 * @param {string} title - Code block title
 * @param {boolean} showCopy - Whether to show copy button
 * @returns {TemplateResult} Code block template
 */
export function codeBlockComponent(code, language = '', title = '', showCopy = true) {
  const codeId = `code-${Math.random().toString(36).substr(2, 9)}`;
  
  return html`
    <div class="code-block">
      ${title ? html`
        <div class="d-flex justify-content-between align-items-center mb-2">
          <h6 class="mb-0">${title}</h6>
          ${showCopy ? html`
            <button class="btn btn-sm btn-outline-secondary" 
                    @click=${() => copyCodeToClipboard(codeId)}>
              Copy
            </button>
          ` : ''}
        </div>
      ` : ''}
      <pre class="${language ? `language-${language}` : ''}"><code id="${codeId}">${code}</code></pre>
    </div>
  `;
}

/**
 * Copy code to clipboard helper
 */
async function copyCodeToClipboard(codeId) {
  const codeElement = document.getElementById(codeId);
  if (codeElement) {
    try {
      await navigator.clipboard.writeText(codeElement.textContent);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  }
}

/**
 * Collapsible section component
 * @param {Object} options - Collapse options
 * @param {string} options.id - Collapse ID
 * @param {string} options.title - Section title
 * @param {TemplateResult} options.content - Section content
 * @param {boolean} options.expanded - Initial expanded state
 * @param {string} options.variant - Badge variant for title
 * @returns {TemplateResult} Collapsible template
 */
export function collapsibleComponent({
  id,
  title,
  content,
  expanded = false,
  variant = 'secondary'
}) {
  return html`
    <div class="card mb-2">
      <div class="card-header p-0">
        <button 
          class="btn btn-link text-decoration-none w-100 text-start p-3" 
          type="button" 
          data-bs-toggle="collapse" 
          data-bs-target="#${id}" 
          aria-expanded="${expanded}" 
          aria-controls="${id}"
        >
          <span class="badge bg-${variant} me-2">${title}</span>
        </button>
      </div>
      <div class="collapse ${expanded ? 'show' : ''}" id="${id}">
        <div class="card-body">
          ${content}
        </div>
      </div>
    </div>
  `;
}