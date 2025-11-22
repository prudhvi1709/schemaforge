// File: js/utils.js
// Main utilities module - re-exports shared utilities and provides data profiling

import dataProfile from "https://unpkg.com/data-profile@1.0.0/dist/index.min.js";

// Re-export shared utilities for convenience
export { $, showElements, hideElements, setLoading, updateStatus, renderLoadingSpinner, renderContent } from "./utils/dom-utils.js";
export { downloadFile, copyToClipboard, copyTextToClipboard, readFileAs, getSampleData, formatExcelDate, excelSerialToDate } from "./utils/file-utils.js";
export { streamLLMRequest, makeLLMRequest, extractJsonFromResponse, getSelectedModel } from "./utils/llm-utils.js";

/**
 * Load text content from a file path
 * @param {string} filePath - Path to the text file
 * @returns {Promise<string>} File content as string
 */
export async function loadtxt(filePath) {
  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`Failed to load file: ${filePath}`);
    }
    return await response.text();
  } catch (error) {
    throw new Error(`Error loading text file ${filePath}: ${error.message}`);
  }
}

/**
 * Default options for data profiling
 */
const DEFAULT_PROFILE_OPTIONS = {
  associationMatrix: true,
  keysDependencies: true,
  missingnessPatterns: true,
  outliers: true,
  categoricalEntropy: true
};

/**
 * Generate comprehensive data profile for LLM analysis
 * @param {Array} data - Array of data objects to profile
 * @param {Object} options - Profiling options (merged with defaults)
 * @returns {Object} Comprehensive data profile
 */
export function generateDataProfile(data, options = {}) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return { error: "No data provided for profiling" };
  }

  try {
    const mergedOptions = { ...DEFAULT_PROFILE_OPTIONS, ...options };
    const profile = dataProfile(data, mergedOptions);

    return {
      profile: JSON.stringify(profile, null, 2),
      summary: {
        totalRows: data.length,
        totalColumns: Object.keys(data[0] || {}).length,
        profileGenerated: true
      }
    };
  } catch (error) {
    console.error("Data profiling error:", error);
    return {
      error: `Data profiling failed: ${error.message}`,
      fallbackData: JSON.stringify(data.slice(0, 5), null, 2)
    };
  }
}

/**
 * Convert sheet data to array format suitable for data profiling
 * @param {Object} sheet - Sheet object with headers and sampleRows
 * @returns {Array} Array of objects for profiling
 */
export function convertSheetToProfileData(sheet) {
  if (!sheet || !sheet.headers || !sheet.sampleRows) {
    return [];
  }

  return sheet.sampleRows.map(row => {
    const obj = {};
    sheet.headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

/**
 * Generate profiles for all sheets in file data
 * @param {Object} fileData - File data with sheets array
 * @returns {Array} Array of profile results per sheet
 */
export function generateSheetProfiles(fileData) {
  if (!fileData?.sheets) {
    return [];
  }

  return fileData.sheets.map(sheet => {
    const profileData = convertSheetToProfileData(sheet);
    const profile = generateDataProfile(profileData);
    return {
      sheetName: sheet.name,
      profile: profile.profile || profile.error || "Profile unavailable",
      summary: profile.summary
    };
  });
}