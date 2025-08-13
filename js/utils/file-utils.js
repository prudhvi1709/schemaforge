/**
 * File Utility Functions
 * Shared file operations and parsing utilities
 */

/**
 * Download a file with given content
 * @param {string} filename - Name of the file
 * @param {string} content - File content
 * @param {string} mimeType - MIME type of the file
 */
export function downloadFile(filename, content, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download multiple files as separate downloads
 * @param {Array} files - Array of {filename, content, mimeType} objects
 * @param {number} delay - Delay between downloads in ms
 */
export function downloadMultipleFiles(files, delay = 100) {
  files.forEach((file, index) => {
    setTimeout(() => {
      downloadFile(file.filename, file.content, file.mimeType);
    }, index * delay);
  });
}

/**
 * Read file as text with encoding detection
 * @param {File} file - File object
 * @param {string} encoding - Text encoding (default: utf-8)
 * @returns {Promise<string>} File content as text
 */
export function readFileAsText(file, encoding = 'utf-8') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(new Error(`Failed to read file: ${e.target.error.message}`));
    reader.readAsText(file, encoding);
  });
}

/**
 * Read file as ArrayBuffer
 * @param {File} file - File object
 * @returns {Promise<ArrayBuffer>} File content as ArrayBuffer
 */
export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(new Error(`Failed to read file: ${e.target.error.message}`));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Get file extension from filename
 * @param {string} filename - Filename
 * @returns {string} File extension in lowercase
 */
export function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

/**
 * Validate file type against allowed extensions
 * @param {File} file - File object
 * @param {Array<string>} allowedExtensions - Array of allowed extensions
 * @returns {boolean} Whether file type is allowed
 */
export function isFileTypeAllowed(file, allowedExtensions) {
  const extension = getFileExtension(file.name);
  return allowedExtensions.includes(extension);
}

/**
 * Format file size in human readable format
 * @param {number} bytes - File size in bytes
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted file size
 */
export function formatFileSize(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Validate file size against maximum allowed size
 * @param {File} file - File object
 * @param {number} maxSizeMB - Maximum size in MB
 * @returns {boolean} Whether file size is within limit
 */
export function isFileSizeValid(file, maxSizeMB) {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return file.size <= maxSizeBytes;
}

/**
 * Create a temporary download URL for a file
 * @param {string} content - File content
 * @param {string} mimeType - MIME type
 * @returns {string} Temporary URL
 */
export function createDownloadURL(content, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * Revoke a temporary URL created by createDownloadURL
 * @param {string} url - URL to revoke
 */
export function revokeDownloadURL(url) {
  URL.revokeObjectURL(url);
}

/**
 * Extract content from different file types
 * @param {File} file - File object
 * @returns {Promise<Object>} Parsed file content
 */
export async function extractFileContent(file) {
  const extension = getFileExtension(file.name);
  
  switch (extension) {
    case 'json':
      return await extractJsonContent(file);
    case 'csv':
      return await extractCsvContent(file);
    case 'txt':
      return await extractTextContent(file);
    case 'xml':
      return await extractXmlContent(file);
    default:
      throw new Error(`Unsupported file type: ${extension}`);
  }
}

/**
 * Extract JSON file content
 * @param {File} file - JSON file
 * @returns {Promise<Object>} Parsed JSON
 */
async function extractJsonContent(file) {
  try {
    const text = await readFileAsText(file);
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON file: ${error.message}`);
  }
}

/**
 * Extract CSV file content (basic parsing)
 * @param {File} file - CSV file
 * @returns {Promise<Array>} CSV rows
 */
async function extractCsvContent(file) {
  const text = await readFileAsText(file);
  const lines = text.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }
  
  // Basic CSV parsing (doesn't handle quotes/escapes)
  return lines.map(line => line.split(',').map(cell => cell.trim()));
}

/**
 * Extract text file content
 * @param {File} file - Text file
 * @returns {Promise<string>} File content
 */
async function extractTextContent(file) {
  return await readFileAsText(file);
}

/**
 * Extract XML file content
 * @param {File} file - XML file
 * @returns {Promise<Document>} Parsed XML document
 */
async function extractXmlContent(file) {
  const text = await readFileAsText(file);
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, 'text/xml');
  
  // Check for parsing errors
  const parseError = xmlDoc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Invalid XML file');
  }
  
  return xmlDoc;
}

/**
 * File validation result object
 * @typedef {Object} FileValidationResult
 * @property {boolean} valid - Whether file is valid
 * @property {Array<string>} errors - Validation error messages
 * @property {Array<string>} warnings - Validation warning messages
 */

/**
 * Comprehensive file validation
 * @param {File} file - File to validate
 * @param {Object} options - Validation options
 * @param {Array<string>} options.allowedExtensions - Allowed file extensions
 * @param {number} options.maxSizeMB - Maximum file size in MB
 * @param {boolean} options.required - Whether file is required
 * @returns {FileValidationResult} Validation result
 */
export function validateFile(file, options = {}) {
  const {
    allowedExtensions = [],
    maxSizeMB = 10,
    required = true
  } = options;

  const errors = [];
  const warnings = [];

  // Check if file is provided when required
  if (required && !file) {
    errors.push('File is required');
    return { valid: false, errors, warnings };
  }

  if (!file) {
    return { valid: true, errors, warnings };
  }

  // Check file type
  if (allowedExtensions.length > 0 && !isFileTypeAllowed(file, allowedExtensions)) {
    errors.push(`File type not allowed. Allowed types: ${allowedExtensions.join(', ')}`);
  }

  // Check file size
  if (!isFileSizeValid(file, maxSizeMB)) {
    errors.push(`File size exceeds maximum allowed size of ${maxSizeMB}MB`);
  }

  // File size warnings
  if (file.size > 5 * 1024 * 1024) { // 5MB
    warnings.push(`Large file detected (${formatFileSize(file.size)}). Processing may take longer.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}