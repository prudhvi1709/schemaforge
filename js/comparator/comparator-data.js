// File: js/comparator/comparator-data.js
// Data processing utilities for dataset comparison

import { formatExcelDate, readFileAs } from "../utils/file-utils.js";

/**
 * Get sample data from array (first 10 rows with columns)
 * @param {Array} data - Array of data objects
 * @returns {Object} Object with columns and rows arrays
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
 * Process uploaded file to extract multiple sheets for comparison
 * @param {File} file - File object to process
 * @returns {Promise<Object>} Object with tabData and tabNames
 */
export function processFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });

        if (workbook.SheetNames.length < 2) {
          throw new Error('File must contain at least 2 sheets/tabs');
        }

        const [sheet1Name, sheet2Name] = workbook.SheetNames;
        resolve({
          tabData: {
            tab1: XLSX.utils.sheet_to_json(workbook.Sheets[sheet1Name]),
            tab2: XLSX.utils.sheet_to_json(workbook.Sheets[sheet2Name])
          },
          tabNames: {
            tab1: sheet1Name,
            tab2: sheet2Name
          }
        });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Process existing file content (ArrayBuffer) for comparison
 * @param {ArrayBuffer} fileContent - File content as ArrayBuffer
 * @returns {Object} Object with tabData and tabNames
 */
export function processExistingFileContent(fileContent) {
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
 * Apply column mapping to transform data rows to common column names
 * @param {Array} data - Array of data objects
 * @param {Object} columnMapping - Column mapping configuration
 * @param {boolean} isDataset1 - Whether this is dataset 1 (true) or dataset 2 (false)
 * @returns {Array} Transformed data with common column names
 */
export function applyColumnMapping(data, columnMapping, isDataset1 = true) {
  if (!columnMapping || !data.length) return data;

  return data.map(row => {
    const mappedRow = {};

    columnMapping.mappings.forEach(mapping => {
      const sourceCol = isDataset1 ? mapping.dataset1_column : mapping.dataset2_column;

      if (sourceCol && row.hasOwnProperty(sourceCol)) {
        let value = row[sourceCol];

        // Convert Excel date serials to readable dates
        if (mapping.data_type === 'date' || mapping.is_excel_date_serial) {
          value = formatExcelDate(value);
        }

        mappedRow[mapping.common_name] = value;
      }
    });

    return mappedRow;
  });
}

/**
 * Calculate summary statistics grouped by specified keys
 * @param {Array} data - Array of data objects
 * @param {Array} groupingKeys - Column names to group by
 * @param {Array} sumColumns - Column names to sum
 * @param {Array} countColumns - Column names to count non-null values
 * @returns {Array} Array of summary objects per group
 */
export function calculateSummaries(data, groupingKeys, sumColumns, countColumns) {
  if (!data?.length) return [];

  const groups = {};

  data.forEach(row => {
    // Create group key from grouping columns or use 'Total' if none specified
    const groupKey = groupingKeys.length
      ? groupingKeys.map(key => String(row[key] || '')).join('|')
      : 'Total';

    // Initialize group if not exists
    if (!groups[groupKey]) {
      groups[groupKey] = {
        group: groupKey,
        sums: {},
        counts: {},
        count: 0,
        rows: []
      };
      sumColumns.forEach(col => groups[groupKey].sums[col] = 0);
      countColumns.forEach(col => groups[groupKey].counts[col] = 0);
    }

    // Calculate sums
    sumColumns.forEach(col => {
      if (row[col] && !isNaN(parseFloat(row[col]))) {
        groups[groupKey].sums[col] += parseFloat(row[col]);
      }
    });

    // Calculate counts (non-null, non-empty values)
    countColumns.forEach(col => {
      if (row[col] != null && row[col] !== '') {
        groups[groupKey].counts[col]++;
      }
    });

    groups[groupKey].count++;
    groups[groupKey].rows.push(row);
  });

  return Object.values(groups);
}

/**
 * Compare summaries from two datasets and identify mismatches
 * @param {Array} summary1 - Summary array from dataset 1
 * @param {Array} summary2 - Summary array from dataset 2
 * @param {Array} sumColumns - Columns that were summed
 * @param {Array} countColumns - Columns that were counted
 * @param {number} tolerance - Tolerance for sum comparison (default: 0.01)
 * @returns {Array} Comparison results with mismatch indicators
 */
export function compareSummaries(summary1, summary2, sumColumns, countColumns, tolerance = 0.01) {
  // Get all unique groups from both summaries
  const allGroups = [...new Set([
    ...summary1.map(s => s.group),
    ...summary2.map(s => s.group)
  ])];

  return allGroups.map(group => {
    const s1 = summary1.find(s => s.group === group) || { sums: {}, counts: {}, count: 0, rows: [] };
    const s2 = summary2.find(s => s.group === group) || { sums: {}, counts: {}, count: 0, rows: [] };

    // Ensure all columns exist in both summaries
    [...sumColumns, ...countColumns].forEach(col => {
      if (!s1.sums[col]) s1.sums[col] = 0;
      if (!s2.sums[col]) s2.sums[col] = 0;
      if (!s1.counts[col]) s1.counts[col] = 0;
      if (!s2.counts[col]) s2.counts[col] = 0;
    });

    // Check for mismatches
    let hasMismatch = false;

    sumColumns.forEach(col => {
      if (Math.abs(s1.sums[col] - s2.sums[col]) > tolerance) {
        hasMismatch = true;
      }
    });

    countColumns.forEach(col => {
      if (s1.counts[col] !== s2.counts[col]) {
        hasMismatch = true;
      }
    });

    return {
      group,
      tab1Sums: s1.sums,
      tab2Sums: s2.sums,
      tab1Counts: s1.counts,
      tab2Counts: s2.counts,
      hasMismatch,
      tab1Rows: s1.rows,
      tab2Rows: s2.rows
    };
  });
}

/**
 * Get mapped columns that exist in both datasets
 * @param {Object} columnMapping - Column mapping configuration
 * @returns {Array} Array of common column names
 */
export function getMappedCommonNames(columnMapping) {
  return columnMapping.mappings
    .filter(mapping => mapping.dataset1_column && mapping.dataset2_column)
    .map(mapping => mapping.common_name);
}

/**
 * Filter suggested columns to only include mapped ones
 * @param {Array} suggestedColumns - Array of suggested column names
 * @param {Array} mappedCommonNames - Array of mapped common names
 * @returns {Array} Filtered array of column names
 */
export function filterMappedColumns(suggestedColumns, mappedCommonNames) {
  return (suggestedColumns || []).filter(col => mappedCommonNames.includes(col));
}
