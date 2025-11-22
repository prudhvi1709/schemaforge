// File: js/handlers/chat-handlers.js
// Chat functionality handlers extracted from main.js

import { html, render } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
import { parseFile } from "../file-parser.js";
import { streamChatResponse, resetChatHistory } from "../llm-service.js";
import { renderResults, renderChatMessage, showDbtRuleLoadingIndicator } from "../ui.js";
import { $, setLoading, updateStatus } from "../utils/dom-utils.js";

const marked = new Marked();

// Module state
let chatAttachedFile = null;

/**
 * Format chat message with Markdown rendering
 * @param {string} message - Message to format
 * @returns {TemplateResult} Lit-html template with rendered markdown
 */
export function formatChatMessageWithMarked(message) {
  return message ? unsafeHTML(marked.parse(message)) : "";
}

/**
 * Set up chat file attachment listeners (drag & drop, file input)
 */
export function setupChatFileListeners() {
  const elements = {
    attachBtn: $("chat-attach-btn"),
    fileInput: $("chat-file-input"),
    dropZone: $("chat-drop-zone"),
    fileRemove: $("chat-file-remove")
  };

  elements.attachBtn?.addEventListener("click", () => elements.fileInput.click());
  elements.fileInput?.addEventListener("change", (e) => {
    if (e.target.files[0]) handleChatFileSelect(e.target.files[0]);
  });
  elements.fileRemove?.addEventListener("click", clearChatFile);

  // Drag and drop handlers
  const dragHandlers = {
    dragover: (e) => {
      e.preventDefault();
      e.currentTarget.classList.add("border-primary");
    },
    dragleave: (e) => e.currentTarget.classList.remove("border-primary"),
    drop: (e) => {
      e.preventDefault();
      e.currentTarget.classList.remove("border-primary");
      if (e.dataTransfer.files[0]) handleChatFileSelect(e.dataTransfer.files[0]);
    }
  };

  Object.entries(dragHandlers).forEach(([event, handler]) => {
    elements.dropZone?.addEventListener(event, handler);
  });
}

/**
 * Set up chat window resize functionality
 */
export function setupChatResize() {
  const chatContainer = $('chat-container-floating');
  const handles = chatContainer?.querySelectorAll('.resize-handle');

  if (!chatContainer || !handles) return;

  handles.forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();

      // Extract direction from class names
      const classList = handle.classList;
      const direction = {
        n: classList.contains('resize-n') || classList.contains('resize-ne') || classList.contains('resize-nw'),
        s: classList.contains('resize-s') || classList.contains('resize-se') || classList.contains('resize-sw'),
        e: classList.contains('resize-e') || classList.contains('resize-se') || classList.contains('resize-ne'),
        w: classList.contains('resize-w') || classList.contains('resize-sw') || classList.contains('resize-nw')
      };

      const startX = e.clientX, startY = e.clientY;
      const rect = chatContainer.getBoundingClientRect();
      const startWidth = rect.width, startHeight = rect.height;
      const startRight = parseFloat(getComputedStyle(chatContainer).right);
      const startBottom = parseFloat(getComputedStyle(chatContainer).bottom);

      const constraints = {
        minWidth: 300,
        minHeight: 400,
        maxWidth: innerWidth * 0.8,
        maxHeight: innerHeight * 0.8
      };

      function doResize(e) {
        const deltaX = e.clientX - startX, deltaY = e.clientY - startY;

        let newWidth = direction.e ? startWidth + deltaX : direction.w ? startWidth - deltaX : startWidth;
        let newHeight = direction.s ? startHeight + deltaY : direction.n ? startHeight - deltaY : startHeight;

        // Constrain dimensions
        const constrainDimension = (value, min, max, isReverse, startPos, startDim) => {
          if (value < min) return { size: min, pos: isReverse ? startPos + startDim - min : startPos };
          if (value > max) return { size: max, pos: isReverse ? startPos + startDim - max : startPos };
          return { size: value, pos: isReverse ? startPos + startDim - value : startPos };
        };

        const width = constrainDimension(newWidth, constraints.minWidth, constraints.maxWidth, direction.w, startRight, startWidth);
        const height = constrainDimension(newHeight, constraints.minHeight, constraints.maxHeight, direction.n, startBottom, startHeight);

        chatContainer.style.width = width.size + 'px';
        chatContainer.style.height = height.size + 'px';
        if (direction.w) chatContainer.style.right = width.pos + 'px';
        if (direction.n) chatContainer.style.bottom = height.pos + 'px';
      }

      const stopResize = () => {
        document.removeEventListener('mousemove', doResize);
        document.removeEventListener('mouseup', stopResize);
      };

      document.addEventListener('mousemove', doResize);
      document.addEventListener('mouseup', stopResize);
    });
  });
}

/**
 * Handle file selection for chat attachment
 * @param {File} file - Selected file
 */
export function handleChatFileSelect(file) {
  chatAttachedFile = file;
  $("chat-file-name").textContent = file.name;
  $("chat-file-preview").classList.remove("d-none");
}

/**
 * Clear attached chat file
 */
export function clearChatFile() {
  chatAttachedFile = null;
  $("chat-file-preview").classList.add("d-none");
  $("chat-file-input").value = '';
}

/**
 * Get currently attached chat file
 * @returns {File|null} Attached file or null
 */
export function getChatAttachedFile() {
  return chatAttachedFile;
}

/**
 * Toggle floating chat window visibility
 */
export function toggleFloatingChat() {
  const chat = $("chat-container-floating");
  const isHidden = chat.classList.contains("d-none");
  chat.classList.toggle("d-none", !isHidden);
  chat.classList.toggle("d-block", isHidden);
  if (isHidden) $("chat-input-floating").focus();
}

/**
 * Reset chat history and clear UI
 */
export function handleResetChat() {
  resetChatHistory();
  clearChatFile();
  render(html``, $("chat-messages-floating"));
  updateStatus("Chat history has been reset", "info");
}

/**
 * Handle chat form submission
 * @param {Event} event - Form submit event
 * @param {Object} context - Context object { fileData, schemaData, dbtRulesData, llmConfig, getSelectedModel }
 * @param {Function} onDbtRulesUpdate - Callback when DBT rules are updated
 */
export async function handleChatSubmit(event, context, onDbtRulesUpdate) {
  event.preventDefault();

  const chatInput = $("chat-input-floating");
  const userMessage = chatInput.value.trim();
  const { fileData, schemaData, dbtRulesData, llmConfig, getSelectedModel } = context;

  if (!userMessage || !llmConfig) return;

  let attachmentData = null;
  let displayMessage = userMessage;

  // Handle file attachment
  if (chatAttachedFile) {
    try {
      attachmentData = await parseFile(chatAttachedFile);
      displayMessage += ` [Attached: ${chatAttachedFile.name}]`;
    } catch (error) {
      return renderChatMessage("system", `Error reading file: ${error.message}`);
    }
  }

  renderChatMessage("user", displayMessage);
  chatInput.value = "";
  if (chatAttachedFile) clearChatFile();
  setLoading("chat-floating", true);

  try {
    const chatContext = {
      fileData: fileData || attachmentData,
      schema: schemaData,
      dbtRules: dbtRulesData,
      attachedFile: attachmentData
    };

    const placeholder = document.createElement("div");
    $("chat-messages-floating").appendChild(placeholder);

    const response = await streamChatResponse(chatContext, userMessage, llmConfig, (partial) => {
      if (partial === "Generating DBT rule modifications...") {
        placeholder.remove();
        showDbtRuleLoadingIndicator(true);
      } else {
        render(html`
          <div class="card mb-2">
            <div class="card-body">
              <p class="card-text">${formatChatMessageWithMarked(partial)}</p>
            </div>
          </div>
        `, placeholder);
        $("chat-messages-floating").scrollTop = $("chat-messages-floating").scrollHeight;
      }
    }, getSelectedModel());

    if (placeholder.parentNode) placeholder.remove();
    showDbtRuleLoadingIndicator(false);

    // Handle DBT rules update in response
    const rulesMatch = response.match(/<!-- UPDATED_DBT_RULES:(.+?) -->/s);
    if (rulesMatch) {
      try {
        const updatedRules = JSON.parse(rulesMatch[1]);
        onDbtRulesUpdate(updatedRules, response);

        const clean = response
          .replace(/<!-- UPDATED_DBT_RULES:.+? -->/s, '')
          .replace(/<!-- LAST_MODIFIED_TABLE:.+? -->/s, '');
        renderChatMessage("assistant", clean, true);

        if (clean.includes('DBT Rules Updated')) {
          handleDbtRuleUpdate(response, clean);
        }
      } catch {
        renderChatMessage("assistant", response, true);
      }
    } else {
      renderChatMessage("assistant", response, true);
    }
  } catch (error) {
    updateStatus(`Chat error: ${error.message}`, "danger");
    renderChatMessage("system", `Error: ${error.message}`);
  } finally {
    setLoading("chat-floating", false);
  }
}

/**
 * Handle DBT rule update - navigate to DBT tab and highlight changes
 * @param {string} fullResponse - Full response including metadata
 * @param {string} cleanResponse - Response without metadata
 */
function handleDbtRuleUpdate(fullResponse, cleanResponse) {
  const tab = document.querySelector('[data-bs-target="#dbt-tab"]');
  if (!tab?.click) return;

  tab.click();
  setTimeout(() => {
    let tableName = fullResponse.match(/<!-- LAST_MODIFIED_TABLE:([^\s]+) -->/s)?.[1];
    let target = null;

    if (tableName) {
      target = Array.from(document.querySelectorAll('.card-header h5'))
        .find(card => card.textContent.includes(tableName))?.closest('.card');
    }

    if (!target) {
      tableName = cleanResponse.match(/(?:Added new rule|Modified rule) for table ['']([^']+)['']]/)?.[1];
      if (tableName) {
        target = Array.from(document.querySelectorAll('.card-header h5'))
          .find(card => card.textContent.includes(tableName))?.closest('.card');
      }
    }

    (target || $('dbt-content'))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);
}
