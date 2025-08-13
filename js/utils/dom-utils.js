/**
 * DOM Utility Functions
 * Shared DOM manipulation and event handling utilities
 */

/**
 * Safely get element by ID with optional error handling
 * @param {string} elementId - The element ID to find
 * @param {boolean} required - Whether to throw error if not found
 * @returns {HTMLElement|null} The element or null
 */
export function getElementById(elementId, required = false) {
  const element = document.getElementById(elementId);
  if (required && !element) {
    throw new Error(`Required element not found: ${elementId}`);
  }
  return element;
}

/**
 * Add event listener with error handling
 * @param {string} elementId - Element ID
 * @param {string} event - Event type
 * @param {Function} handler - Event handler
 * @param {boolean} required - Whether element is required
 */
export function addEventListenerById(elementId, event, handler, required = false) {
  const element = getElementById(elementId, required);
  if (element) {
    element.addEventListener(event, handler);
  }
}

/**
 * Add multiple event listeners to an element
 * @param {string} elementId - Element ID
 * @param {Object} eventHandlers - Object mapping event types to handlers
 * @param {boolean} required - Whether element is required
 */
export function addMultipleEventListeners(elementId, eventHandlers, required = false) {
  const element = getElementById(elementId, required);
  if (element) {
    Object.entries(eventHandlers).forEach(([event, handler]) => {
      element.addEventListener(event, handler);
    });
  }
}

/**
 * Toggle CSS classes on element
 * @param {string} elementId - Element ID
 * @param {string|Array} classes - Class or classes to toggle
 * @param {boolean} condition - Whether to add or remove classes
 */
export function toggleClasses(elementId, classes, condition) {
  const element = getElementById(elementId);
  if (!element) return;

  const classList = Array.isArray(classes) ? classes : [classes];
  classList.forEach(className => {
    element.classList.toggle(className, condition);
  });
}

/**
 * Set element visibility using Bootstrap classes
 * @param {string} elementId - Element ID
 * @param {boolean} visible - Whether element should be visible
 */
export function setVisibility(elementId, visible) {
  toggleClasses(elementId, ['d-none'], !visible);
}

/**
 * Set element loading state
 * @param {string} elementId - Element ID
 * @param {boolean} loading - Loading state
 */
export function setElementLoading(elementId, loading) {
  const element = getElementById(elementId);
  if (!element) return;

  const spinner = element.querySelector('.spinner-border');
  const button = element.tagName === 'BUTTON' ? element : element.closest('button');

  if (spinner) {
    toggleClasses(spinner.id || `${elementId}-spinner`, ['d-none'], !loading);
  }

  if (button) {
    button.disabled = loading;
  }
}

/**
 * Scroll element into view with smooth behavior
 * @param {string|HTMLElement} target - Element ID or element
 * @param {string} block - Scroll positioning (start, center, end, nearest)
 */
export function scrollToElement(target, block = 'center') {
  const element = typeof target === 'string' ? getElementById(target) : target;
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block });
  }
}

/**
 * Set focus on element with optional delay
 * @param {string} elementId - Element ID
 * @param {number} delay - Delay in milliseconds
 */
export function focusElement(elementId, delay = 0) {
  const element = getElementById(elementId);
  if (element) {
    if (delay > 0) {
      setTimeout(() => element.focus(), delay);
    } else {
      element.focus();
    }
  }
}

/**
 * Copy text to clipboard with fallback
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success status
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand('copy');
      textArea.remove();
      return success;
    }
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}

/**
 * Debounce function execution
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @param {boolean} immediate - Whether to execute immediately
 * @returns {Function} Debounced function
 */
export function debounce(func, wait, immediate = false) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func(...args);
  };
}

/**
 * Drag and drop handlers with consistent styling
 */
export const dragDropHandlers = {
  dragOver: (e) => {
    e.preventDefault();
    e.currentTarget.classList.add("border-primary");
  },
  
  dragLeave: (e) => {
    e.currentTarget.classList.remove("border-primary");
  },
  
  drop: (e, callback) => {
    e.preventDefault();
    e.currentTarget.classList.remove("border-primary");
    const file = e.dataTransfer.files[0];
    if (file && callback) {
      callback(file);
    }
  }
};

/**
 * Setup drag and drop functionality
 * @param {string} elementId - Drop zone element ID
 * @param {Function} onDrop - Drop callback
 */
export function setupDragDrop(elementId, onDrop) {
  const element = getElementById(elementId);
  if (element) {
    element.addEventListener('dragover', dragDropHandlers.dragOver);
    element.addEventListener('dragleave', dragDropHandlers.dragLeave);
    element.addEventListener('drop', (e) => dragDropHandlers.drop(e, onDrop));
  }
}