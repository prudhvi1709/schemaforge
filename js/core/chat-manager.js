/**
 * Chat Manager
 * Handles chat functionality, file attachments, and streaming responses
 */

import { html, render } from 'lit-html';
import { unsafeHTML } from "lit-html/directives/unsafe-html";
import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
import { parseFile } from "../file-parser.js";
import { streamChatResponse, resetChatHistory } from "../llm-service.js";
import { showDbtRuleLoadingIndicator } from "../ui.js";
import { renderResults } from "../ui.js";
import { setLoading, updateStatus } from "./status-manager.js";
import { getLLMConfig, getSelectedModel } from "./app-initializer.js";
import { getFileData, getSchemaData, getDbtRulesData } from "./event-handlers.js";
import { getElementById, focusElement, scrollToElement } from '../utils/dom-utils.js';
import { AppStorage } from '../utils/storage-utils.js';

// Initialize Marked for markdown parsing
const marked = new Marked();

let chatAttachedFile = null;

/**
 * Handle chat submission
 * @param {Event} event - Form submit event
 */
export async function handleChatSubmit(event) {
  event.preventDefault();

  const chatInput = getElementById("chat-input-floating");
  const userMessage = chatInput.value.trim();
  const llmConfig = getLLMConfig();

  if (!userMessage || !llmConfig) return;

  let attachmentData = null;
  let displayMessage = userMessage;

  // Process attached file if exists
  if (chatAttachedFile) {
    try {
      attachmentData = await parseFile(chatAttachedFile);
      displayMessage += ` [Attached: ${chatAttachedFile.name}]`;
    } catch (error) {
      renderChatMessage("system", `Error reading file: ${error.message}`);
      return;
    }
  }

  // Add user message to chat
  renderChatMessage("user", displayMessage);
  chatInput.value = "";

  // Clear attachment after sending
  if (chatAttachedFile) clearChatFile();

  setLoading("chat-floating", true);

  try {
    // Prepare context for the LLM
    const context = {
      fileData: getFileData() || attachmentData,
      schema: getSchemaData(),
      dbtRules: getDbtRulesData(),
      attachedFile: attachmentData
    };

    // Create a placeholder for the assistant's response
    const assistantPlaceholder = document.createElement("div");
    const chatMessages = getElementById("chat-messages-floating");
    chatMessages.appendChild(assistantPlaceholder);

    // Stream the chat response - the LLM will determine if this is a DBT rule modification
    const finalResponse = await streamChatResponse(
      context,
      userMessage,
      llmConfig,
      (partialContent) => {
        handleStreamingChatUpdate(partialContent, assistantPlaceholder);
      },
      getSelectedModel()
    );

    // Process the final response
    await processFinalChatResponse(finalResponse, assistantPlaceholder);

  } catch (error) {
    updateStatus(`Chat error: ${error.message}`, "danger");
    renderChatMessage("system", `Error: ${error.message}`);
  } finally {
    setLoading("chat-floating", false);
  }
}

/**
 * Handle streaming chat updates
 * @param {string} partialContent - Partial content from streaming
 * @param {HTMLElement} placeholder - Placeholder element
 */
function handleStreamingChatUpdate(partialContent, placeholder) {
  // If this is a loading message for DBT rules, show a special loading indicator
  if (partialContent === "Generating DBT rule modifications...") {
    // Remove the placeholder
    placeholder.remove();
    // Show the DBT rule loading indicator
    showDbtRuleLoadingIndicator(true);
  } else {
    // Regular message update
    render(
      html`
        <div class="card mb-2">
          <div class="card-body">
            <p class="card-text">
              ${formatChatMessageWithMarked(partialContent)}
            </p>
          </div>
        </div>
      `,
      placeholder
    );

    // Scroll to bottom as content streams in
    const chatContainer = getElementById("chat-messages-floating");
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

/**
 * Process final chat response and handle DBT rule updates
 * @param {string} finalResponse - Final response from LLM
 * @param {HTMLElement} placeholder - Placeholder element
 */
async function processFinalChatResponse(finalResponse, placeholder) {
  // Remove the placeholder if it still exists
  if (placeholder.parentNode) {
    placeholder.remove();
  }
  
  // Hide the DBT rule loading indicator if it was shown
  showDbtRuleLoadingIndicator(false);

  // Check if the response contains updated DBT rules
  const updatedRulesMatch = finalResponse.match(/<!-- UPDATED_DBT_RULES:(.+?) -->/s);
  if (updatedRulesMatch) {
    try {
      // Extract the updated rules JSON
      const updatedRulesJson = updatedRulesMatch[1];
      const updatedRules = JSON.parse(updatedRulesJson);
      
      // Update the global dbtRulesData
      const schemaData = getSchemaData();
      window.currentDbtRulesData = updatedRules;
      
      // Re-render the DBT rules UI with the updated rules
      renderResults(schemaData, updatedRules);
      
      // Remove the JSON and metadata from the displayed message
      let cleanResponse = finalResponse
        .replace(/<!-- UPDATED_DBT_RULES:.+? -->/s, '')
        .replace(/<!-- LAST_MODIFIED_TABLE:.+? -->/s, '');
      renderChatMessage("assistant", cleanResponse, true);
      
      // Always show the DBT tab when rules are modified or added
      if (cleanResponse.includes('DBT Rules Updated')) {
        handleDbtRuleUpdate(finalResponse, cleanResponse);
      }
    } catch (error) {
      console.error("Error processing updated DBT rules:", error);
      renderChatMessage("assistant", finalResponse, true);
    }
  } else {
    // Regular response without DBT rule updates
    renderChatMessage("assistant", finalResponse, true);
  }
}

/**
 * Handle DBT rule updates - scroll to the updated rule and activate the DBT tab
 * @param {string} fullResponse - The full LLM response including metadata
 * @param {string} cleanResponse - The cleaned response without metadata
 */
function handleDbtRuleUpdate(fullResponse, cleanResponse) {
  // Activate the DBT tab to show the changes
  const tabButton = document.querySelector('[data-bs-target="#dbt-tab"]');
  if (tabButton && typeof tabButton.click === 'function') {
    tabButton.click();
    
    // Scroll the window to show the newly added/modified rule
    setTimeout(() => {
      // Extract the table name from the hidden marker if present
      const tableMatch = fullResponse.match(/<!-- LAST_MODIFIED_TABLE:([^\s]+) -->/s);
      let tableName = tableMatch ? tableMatch[1] : null;
      let targetElement = null;
      
      // If we have a specific table name, try to find its card
      if (tableName) {
        // Look for the exact card with this table name
        const tableCards = Array.from(document.querySelectorAll('.card-header h5'));
        for (const card of tableCards) {
          if (card.textContent.includes(tableName)) {
            targetElement = card.closest('.card');
            break;
          }
        }
      }
      
      // If we couldn't find the specific card, try extracting from the response text
      if (!targetElement) {
        const match = cleanResponse.match(/(?:Added new rule|Modified rule) for table ['']([^']+)['']/);
        if (match && match[1]) {
          tableName = match[1];
          // Look for the card with this table name
          const tableCards = Array.from(document.querySelectorAll('.card-header h5'));
          for (const card of tableCards) {
            if (card.textContent.includes(tableName)) {
              targetElement = card.closest('.card');
              break;
            }
          }
        }
      }
      
      // If we still couldn't find the specific card, fall back to scrolling to the content area
      if (!targetElement) {
        targetElement = getElementById('dbt-content');
      }
      
      if (targetElement) {
        scrollToElement(targetElement, 'center');
      }
    }, 100);
  }
}

/**
 * Render a chat message
 * @param {string} role - Message role (user, assistant, system)
 * @param {string} message - Message content
 * @param {boolean} useMarkdown - Whether to parse markdown
 */
export function renderChatMessage(role, message, useMarkdown = false) {
  const chatMessages = getElementById("chat-messages-floating");
  if (!chatMessages) return;

  const roleClass = role === "user" ? "bg-primary text-white" : "bg-light";
  const content = useMarkdown ? formatChatMessageWithMarked(message) : message;

  const messageTemplate = html`
    <div class="card mb-2">
      <div class="card-body ${roleClass}">
        <p class="card-text mb-0">
          ${typeof content === 'string' ? content : content}
        </p>
      </div>
    </div>
  `;

  // Create a new element and append it
  const messageElement = document.createElement('div');
  render(messageTemplate, messageElement);
  chatMessages.appendChild(messageElement.firstElementChild);

  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Store in chat history
  AppStorage.addChatMessage({ role, message, timestamp: Date.now() });
}

/**
 * Format chat message content with Marked markdown parser
 * @param {string} message - Raw message content
 * @returns {TemplateResult} Formatted message template
 */
function formatChatMessageWithMarked(message) {
  if (!message) return "";

  // Use Marked to parse markdown
  const parsedMarkdown = marked.parse(message);

  // Return as unsafe HTML since it's been parsed by Marked
  return unsafeHTML(parsedMarkdown);
}

/**
 * Handle resetting chat history
 */
export function handleResetChat() {
  resetChatHistory();
  clearChatFile();
  
  const chatMessages = getElementById("chat-messages-floating");
  if (chatMessages) render(html``, chatMessages);
  
  AppStorage.clearChatHistory();
  updateStatus("Chat history has been reset", "info");
}

/**
 * Handle chat file selection
 * @param {File} file - Selected file
 */
export function handleChatFileSelect(file) {
  chatAttachedFile = file;
  const fileName = getElementById("chat-file-name");
  const filePreview = getElementById("chat-file-preview");
  
  if (fileName) fileName.textContent = file.name;
  if (filePreview) filePreview.classList.remove("d-none");
}

/**
 * Clear chat file attachment
 */
export function clearChatFile() {
  chatAttachedFile = null;
  const filePreview = getElementById("chat-file-preview");
  const fileInput = getElementById("chat-file-input");
  
  if (filePreview) filePreview.classList.add("d-none");
  if (fileInput) fileInput.value = '';
}

/**
 * Toggle the floating chat visibility
 */
export function toggleFloatingChat() {
  const chatContainer = getElementById("chat-container-floating");
  
  if (chatContainer.classList.contains("d-none")) {
    chatContainer.classList.remove("d-none");
    chatContainer.classList.add("d-block");
    // Focus on the input
    focusElement("chat-input-floating", 100);
  } else {
    chatContainer.classList.remove("d-block");
    chatContainer.classList.add("d-none");
  }
}

/**
 * Load chat history on page load
 */
export function loadChatHistory() {
  const history = AppStorage.getChatHistory();
  const chatMessages = getElementById("chat-messages-floating");
  
  if (!chatMessages || history.length === 0) return;

  // Clear existing messages
  render(html``, chatMessages);

  // Render historical messages
  history.forEach(msg => {
    renderChatMessage(msg.role, msg.message, msg.role === 'assistant');
  });
}