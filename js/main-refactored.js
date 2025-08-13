/**
 * Main Application Entry Point
 * Coordinates all modules and initializes the application
 */

import { initializeApp, getSelectedModel, getLLMConfig, handleConfigureLlm } from './core/app-initializer.js';
import { setupEventListeners, handleFileUpload, handleGenerateDbtRules, handleSavePrompts, handleResetPrompts, handleRunDbtLocally } from './core/event-handlers.js';
import { handleChatSubmit, handleResetChat, toggleFloatingChat, loadChatHistory } from './core/chat-manager.js';
import { loadSampleDatasets, setupSampleDatasetsListener } from './core/app-initializer.js';
import { getElementById } from './utils/dom-utils.js';

/**
 * Initialize the application
 */
async function init() {
  try {
    // Initialize core app functionality
    await initializeApp();
    
    // Setup all event listeners
    setupEventListeners();
    
    // Setup sample datasets
    setupSampleDatasetsListener();
    
    // Load chat history
    loadChatHistory();
    
    console.log('SchemaForge application initialized successfully');
  } catch (error) {
    console.error('Failed to initialize application:', error);
  }
}

/**
 * Expand all collapsible cards with IDs containing the specified prefix
 * @param {string} prefix - The prefix to match in card IDs (e.g., 'schema-collapse', 'column-collapse')
 */
function expandAllCards(prefix) {
  // Find all collapse elements that match the prefix
  const collapseElements = document.querySelectorAll(`[id^="${prefix}"]`);
  
  collapseElements.forEach(collapseElement => {
    // Check if the element is collapsed
    if (collapseElement.classList.contains('collapse') && !collapseElement.classList.contains('show')) {
      // Create a Bootstrap collapse instance and show it
      const bsCollapse = new bootstrap.Collapse(collapseElement, {
        toggle: false
      });
      bsCollapse.show();
      
      // Update the associated button's aria-expanded attribute
      const triggerButton = document.querySelector(`[data-bs-target="#${collapseElement.id}"]`);
      if (triggerButton) {
        triggerButton.setAttribute('aria-expanded', 'true');
      }
    }
  });
}

// Make functions globally available for backward compatibility
window.expandAllCards = expandAllCards;
window.getSelectedModel = getSelectedModel;
window.getLLMConfig = getLLMConfig;
window.handleRunDbtLocally = handleRunDbtLocally;

// Global state for backward compatibility
window.currentFileData = null;
window.currentSchemaData = null;
window.currentDbtRulesData = null;
window.generatedConversionFiles = null;

// Initialize the application when DOM is ready
document.addEventListener("DOMContentLoaded", init);