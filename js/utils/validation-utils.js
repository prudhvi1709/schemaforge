/**
 * Validation Utility Functions
 * Shared validation and error handling utilities
 */

/**
 * Validation result object
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {Array<string>} errors - Array of error messages
 * @property {Array<string>} warnings - Array of warning messages
 * @property {Object} data - Cleaned/processed data
 */

/**
 * Create a validation result object
 * @param {boolean} valid - Validation status
 * @param {Array<string>} errors - Error messages
 * @param {Array<string>} warnings - Warning messages
 * @param {any} data - Processed data
 * @returns {ValidationResult} Validation result
 */
export function createValidationResult(valid, errors = [], warnings = [], data = null) {
  return { valid, errors, warnings, data };
}

/**
 * Validate required fields
 * @param {Object} data - Data to validate
 * @param {Array<string>} requiredFields - Required field names
 * @returns {ValidationResult} Validation result
 */
export function validateRequiredFields(data, requiredFields) {
  const errors = [];
  
  if (!data || typeof data !== 'object') {
    return createValidationResult(false, ['Data must be an object']);
  }
  
  requiredFields.forEach(field => {
    if (!(field in data) || data[field] === null || data[field] === undefined || data[field] === '') {
      errors.push(`${field} is required`);
    }
  });
  
  return createValidationResult(errors.length === 0, errors);
}

/**
 * Validate email address
 * @param {string} email - Email to validate
 * @returns {ValidationResult} Validation result
 */
export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const valid = typeof email === 'string' && emailRegex.test(email.trim());
  const errors = valid ? [] : ['Invalid email address format'];
  
  return createValidationResult(valid, errors, [], email?.trim());
}

/**
 * Validate URL
 * @param {string} url - URL to validate
 * @param {Array<string>} allowedProtocols - Allowed protocols (default: http, https)
 * @returns {ValidationResult} Validation result
 */
export function validateUrl(url, allowedProtocols = ['http:', 'https:']) {
  const errors = [];
  
  if (typeof url !== 'string' || !url.trim()) {
    return createValidationResult(false, ['URL is required']);
  }
  
  try {
    const urlObj = new URL(url.trim());
    
    if (!allowedProtocols.includes(urlObj.protocol)) {
      errors.push(`URL protocol must be one of: ${allowedProtocols.join(', ')}`);
    }
    
    return createValidationResult(errors.length === 0, errors, [], urlObj.href);
  } catch (error) {
    return createValidationResult(false, ['Invalid URL format']);
  }
}

/**
 * Validate string length
 * @param {string} value - String to validate
 * @param {Object} options - Validation options
 * @param {number} options.minLength - Minimum length
 * @param {number} options.maxLength - Maximum length
 * @param {boolean} options.required - Whether value is required
 * @returns {ValidationResult} Validation result
 */
export function validateStringLength(value, options = {}) {
  const { minLength = 0, maxLength = Infinity, required = false } = options;
  const errors = [];
  const warnings = [];
  
  if (required && (!value || typeof value !== 'string' || value.trim().length === 0)) {
    return createValidationResult(false, ['Value is required']);
  }
  
  if (!value || typeof value !== 'string') {
    return createValidationResult(!required, [], [], '');
  }
  
  const trimmedValue = value.trim();
  const length = trimmedValue.length;
  
  if (length < minLength) {
    errors.push(`Value must be at least ${minLength} characters long`);
  }
  
  if (length > maxLength) {
    errors.push(`Value must be no more than ${maxLength} characters long`);
  }
  
  // Warnings for length issues
  if (length > maxLength * 0.9) {
    warnings.push(`Value is approaching maximum length (${length}/${maxLength})`);
  }
  
  return createValidationResult(errors.length === 0, errors, warnings, trimmedValue);
}

/**
 * Validate JSON string
 * @param {string} jsonString - JSON string to validate
 * @param {boolean} required - Whether JSON is required
 * @returns {ValidationResult} Validation result with parsed JSON
 */
export function validateJson(jsonString, required = false) {
  if (!jsonString || typeof jsonString !== 'string') {
    return createValidationResult(!required, required ? ['JSON is required'] : [], [], null);
  }
  
  try {
    const parsed = JSON.parse(jsonString.trim());
    return createValidationResult(true, [], [], parsed);
  } catch (error) {
    return createValidationResult(false, [`Invalid JSON format: ${error.message}`]);
  }
}

/**
 * Validate number within range
 * @param {any} value - Value to validate
 * @param {Object} options - Validation options
 * @param {number} options.min - Minimum value
 * @param {number} options.max - Maximum value
 * @param {boolean} options.integer - Whether value must be integer
 * @param {boolean} options.required - Whether value is required
 * @returns {ValidationResult} Validation result
 */
export function validateNumber(value, options = {}) {
  const { min = -Infinity, max = Infinity, integer = false, required = false } = options;
  const errors = [];
  const warnings = [];
  
  if (required && (value === null || value === undefined || value === '')) {
    return createValidationResult(false, ['Number is required']);
  }
  
  if (value === null || value === undefined || value === '') {
    return createValidationResult(!required, [], [], null);
  }
  
  const numValue = Number(value);
  
  if (isNaN(numValue)) {
    return createValidationResult(false, ['Value must be a valid number']);
  }
  
  if (integer && !Number.isInteger(numValue)) {
    errors.push('Value must be an integer');
  }
  
  if (numValue < min) {
    errors.push(`Value must be at least ${min}`);
  }
  
  if (numValue > max) {
    errors.push(`Value must be no more than ${max}`);
  }
  
  // Warnings
  if (numValue > max * 0.9) {
    warnings.push(`Value is approaching maximum (${numValue}/${max})`);
  }
  
  return createValidationResult(errors.length === 0, errors, warnings, numValue);
}

/**
 * Validate array
 * @param {any} value - Value to validate
 * @param {Object} options - Validation options
 * @param {number} options.minItems - Minimum number of items
 * @param {number} options.maxItems - Maximum number of items
 * @param {Function} options.itemValidator - Function to validate each item
 * @param {boolean} options.required - Whether array is required
 * @returns {ValidationResult} Validation result
 */
export function validateArray(value, options = {}) {
  const { minItems = 0, maxItems = Infinity, itemValidator = null, required = false } = options;
  const errors = [];
  const warnings = [];
  
  if (required && (!value || !Array.isArray(value) || value.length === 0)) {
    return createValidationResult(false, ['Array is required']);
  }
  
  if (!value || !Array.isArray(value)) {
    return createValidationResult(!required, [], [], []);
  }
  
  if (value.length < minItems) {
    errors.push(`Array must have at least ${minItems} items`);
  }
  
  if (value.length > maxItems) {
    errors.push(`Array must have no more than ${maxItems} items`);
  }
  
  // Validate individual items if validator provided
  if (itemValidator && typeof itemValidator === 'function') {
    value.forEach((item, index) => {
      const itemResult = itemValidator(item, index);
      if (itemResult && !itemResult.valid) {
        errors.push(`Item ${index}: ${itemResult.errors.join(', ')}`);
      }
    });
  }
  
  return createValidationResult(errors.length === 0, errors, warnings, value);
}

/**
 * Validate schema data structure
 * @param {any} schemaData - Schema data to validate
 * @returns {ValidationResult} Validation result
 */
export function validateSchemaData(schemaData) {
  const errors = [];
  const warnings = [];
  
  if (!schemaData || typeof schemaData !== 'object') {
    return createValidationResult(false, ['Schema data must be an object']);
  }
  
  if (!Array.isArray(schemaData.schemas)) {
    errors.push('schemas must be an array');
  } else if (schemaData.schemas.length === 0) {
    warnings.push('No schemas provided');
  }
  
  return createValidationResult(errors.length === 0, errors, warnings, schemaData);
}

/**
 * Validate DBT rules data structure
 * @param {any} dbtRulesData - DBT rules data to validate
 * @returns {ValidationResult} Validation result
 */
export function validateDbtRulesData(dbtRulesData) {
  const errors = [];
  if (!dbtRulesData || typeof dbtRulesData !== 'object') {
    return createValidationResult(false, ['DBT rules data must be an object']);
  }
  if (!Array.isArray(dbtRulesData.dbtRules)) {
    errors.push('dbtRules must be an array');
  }
  return createValidationResult(errors.length === 0, errors, [], dbtRulesData);
}

/**
 * Sanitize HTML content to prevent XSS
 * @param {string} html - HTML content to sanitize
 * @returns {string} Sanitized HTML
 */
export function sanitizeHtml(html) {
  if (typeof html !== 'string') return '';
  
  // Basic HTML sanitization - remove script tags and on* attributes
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '')
    .replace(/javascript:/gi, '');
}

/**
 * Composite validator that runs multiple validations
 * @param {any} value - Value to validate
 * @param {Array<Function>} validators - Array of validator functions
 * @returns {ValidationResult} Combined validation result
 */
export function runValidators(value, validators) {
  const allErrors = [];
  const allWarnings = [];
  let processedValue = value;
  
  for (const validator of validators) {
    const result = validator(processedValue);
    if (!result.valid) {
      allErrors.push(...result.errors);
    }
    allWarnings.push(...result.warnings);
    
    // Use processed data from validator if available
    if (result.data !== null && result.data !== undefined) {
      processedValue = result.data;
    }
    
    // Stop on first validation failure if needed
    if (!result.valid) {
      break;
    }
  }
  
  return createValidationResult(
    allErrors.length === 0,
    allErrors,
    allWarnings,
    processedValue
  );
}

/**
 * Common validation error messages
 */
export const ValidationMessages = {
  REQUIRED: 'This field is required',
  INVALID_EMAIL: 'Please enter a valid email address',
  INVALID_URL: 'Please enter a valid URL',
  INVALID_JSON: 'Please enter valid JSON',
  INVALID_NUMBER: 'Please enter a valid number',
  TOO_SHORT: (min) => `Must be at least ${min} characters long`,
  TOO_LONG: (max) => `Must be no more than ${max} characters long`,
  OUT_OF_RANGE: (min, max) => `Must be between ${min} and ${max}`,
  INVALID_FORMAT: 'Invalid format'
};