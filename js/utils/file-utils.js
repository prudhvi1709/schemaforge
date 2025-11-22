// File: js/utils/file-utils.js
// Shared file utility functions for SchemaForge

import { html, render } from "lit-html";
import { $ } from "./dom-utils.js";

/**
 * Download content as a file
 * @param {string} filename - Name for the downloaded file
 * @param {string|Blob} content - File content (string or Blob)
 * @param {string} mimeType - MIME type (default: 'text/plain')
 */
export function downloadFile(filename, content, mimeType = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Copy text content to clipboard
 * @param {string} elementId - ID of element containing text to copy
 * @param {Object} options - Options for feedback
 * @param {string} [options.statusContainerId] - Container for status message
 * @param {Function} [options.onSuccess] - Callback on success
 * @param {Function} [options.onError] - Callback on error
 * @returns {Promise<boolean>} Whether copy was successful
 */
export async function copyToClipboard(elementId, options = {}) {
  const element = $(elementId);
  if (!element) return false;

  const { statusContainerId, onSuccess, onError } = options;

  try {
    await navigator.clipboard.writeText(element.textContent);

    if (statusContainerId) {
      const statusDiv = $(statusContainerId);
      if (statusDiv) {
        render(html`<div class="alert alert-success">Copied to clipboard!</div>`, statusDiv);
        setTimeout(() => render(html``, statusDiv), 2000);
      }
    }

    onSuccess?.();
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);

    if (statusContainerId) {
      const statusDiv = $(statusContainerId);
      if (statusDiv) {
        render(html`<div class="alert alert-danger">Failed to copy to clipboard</div>`, statusDiv);
      }
    }

    onError?.(err);
    return false;
  }
}

/**
 * Copy text directly to clipboard (without element reference)
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Whether copy was successful
 */
export async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}

/**
 * Read file as ArrayBuffer or text
 * @param {File} file - File to read
 * @param {string} type - Read type ('arraybuffer' or 'text')
 * @returns {Promise<ArrayBuffer|string>} File content
 */
export function readFileAs(file, type = 'text') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("Error reading file"));

    if (type === 'arraybuffer') {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  });
}

/**
 * Process Excel file to extract multiple sheets
 * @param {ArrayBuffer} fileContent - File content as ArrayBuffer
 * @param {Object} XLSX - XLSX library reference
 * @returns {Object} Object with tabData and tabNames
 */
export function processExcelSheets(fileContent, XLSX) {
  const workbook = XLSX.read(fileContent, { type: 'array' });

  if (workbook.SheetNames.length < 2) {
    throw new Error('File must contain at least 2 sheets/tabs for comparison');
  }

  const [sheet1Name, sheet2Name] = workbook.SheetNames;

  return {
    tabData: {
      tab1: XLSX.utils.sheet_to_json(workbook.Sheets[sheet1Name]),
      tab2: XLSX.utils.sheet_to_json(workbook.Sheets[sheet2Name])
    },
    tabNames: {
      tab1: sheet1Name,
      tab2: sheet2Name
    }
  };
}

/**
 * Get sample data from array (first 10 rows with columns)
 * @param {Array} data - Array of data objects
 * @returns {Object} Object with columns and rows
 */
export function getSampleData(data) {
  if (!data?.length) {
    return { columns: [], rows: [] };
  }
  return {
    columns: Object.keys(data[0]),
    rows: data.slice(0, 10)
  };
}

/**
 * Convert Excel serial date to JavaScript Date
 * @param {number} serialNumber - Excel serial date number
 * @returns {Date} JavaScript Date object
 */
export function excelSerialToDate(serialNumber) {
  // Excel epoch is December 30, 1899
  const excelEpoch = new Date(1899, 11, 30);
  return new Date(excelEpoch.getTime() + (serialNumber * 86400000));
}

/**
 * Format Excel serial date to locale date string
 * @param {*} value - Value that might be an Excel serial date
 * @returns {*} Formatted date string or original value
 */
export function formatExcelDate(value) {
  try {
    if (typeof value === 'number' && value > 1 && value < 100000) {
      return excelSerialToDate(value).toLocaleDateString();
    }
  } catch {
    // Return original value on any error
  }
  return value;
}

/**
 * Get file extension from filename or URL
 * @param {string} fileNameOrUrl - Filename or URL
 * @returns {string} Lowercase file extension
 */
export function getFileExtension(fileNameOrUrl) {
  return fileNameOrUrl.split('.').pop()?.toLowerCase() || '';
}

/**
 * Check if file extension is supported
 * @param {string} extension - File extension
 * @param {Array} supported - Array of supported extensions
 * @returns {boolean} Whether extension is supported
 */
export function isExtensionSupported(extension, supported = ['csv', 'xlsx', 'txt', 'json', 'log']) {
  return supported.includes(extension.toLowerCase());
}
