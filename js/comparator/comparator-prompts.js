// File: js/comparator/comparator-prompts.js
// System prompts and prompt generation for data comparison

/**
 * System prompts for AI-powered data comparison
 */
export const SYSTEM_PROMPTS = {
  columnMapping: `You are a data analyst expert. Analyze two datasets and create column mappings between them.
Your task:
1. Identify which columns from Dataset A correspond to columns in Dataset B (even if names are different).
2. Provide common names for mapped columns
3. **Very IMPORTANT: datatypes must be same for both the mapping columns.**
3. Identify column data types and context
4. **IMPORTANT: Identify date columns - these often appear as Excel serial numbers (like 45932, 45898) or date strings**
5. Suggest which columns are suitable for SUM aggregation and COUNT aggregation
**Date Detection Rules:**
- Numbers like 45932, 45898, 44927 are Excel date serial numbers
- Column names containing "date", "time", "created", "updated" are likely dates
- Values that look like dates (YYYY-MM-DD, MM/DD/YYYY) are dates
Return ONLY a valid JSON object with this exact structure:
{
  "mappings": [
    {
      "dataset1_column": "column_name_from_dataset1",
      "dataset2_column": "column_name_from_dataset2",
      "common_name": "unified_column_name",
      "data_type": "string|number|date|boolean",
      "description": "what this column represents",
      "suitable_for_sum": false,
      "suitable_for_count": true,
      "is_excel_date_serial": true
    }
  ],
  "dataset1_only": ["column1", "column2"],
  "dataset2_only": ["column3", "column4"],
  "suggested_grouping_columns": ["common_name1", "common_name2"],
  "suggested_sum_columns": ["common_name3"],
  "suggested_count_columns": ["common_name1", "common_name4"],
  "date_columns": {
    "dataset1": ["column_name"],
    "dataset2": ["column_name"],
    "mapped": ["common_name"]
  }
}`,

  /**
   * Generate discrepancy analysis prompt based on mismatch status
   * @param {boolean} hasMismatch - Whether there's a data mismatch
   * @returns {string} System prompt for analysis
   */
  discrepancyAnalysis: (hasMismatch) => hasMismatch
    ? `You are a data analyst expert. Analyze the differences between two datasets for a specific group using their statistical profiles and explain why there are discrepancies.
You will receive a json contains statistical profiles of two dataset.
Provide a clear, concise 5-6 lines analysis.`
    : `You are a data analyst expert. Analyze two datasets for a specific group that show matching aggregated values using their statistical profiles.
You will receive a json contains statistical profiles of two dataset.
Provide a clear, concise 5-6 lines analysis.`
};

/**
 * Create user prompt for column mapping analysis
 * @param {Object} sample1 - Sample data from dataset 1 { columns, rows }
 * @param {Object} sample2 - Sample data from dataset 2 { columns, rows }
 * @param {Object} tabNames - Tab names { tab1, tab2 }
 * @returns {string} Formatted user prompt
 */
export function createColumnMappingPrompt(sample1, sample2, tabNames) {
  return `Dataset A (${tabNames.tab1}):
Columns: ${sample1.columns.join(', ')}
Sample Data:
${JSON.stringify(sample1.rows, null, 2)}

Dataset B (${tabNames.tab2}):
Columns: ${sample2.columns.join(', ')}
Sample Data:
${JSON.stringify(sample2.rows, null, 2)}

Create column mappings and analysis. Pay special attention to identifying date columns that may appear as Excel serial numbers.`;
}

/**
 * Create user prompt for discrepancy analysis
 * @param {Object} summaryItem - Summary item with group and row data
 * @param {string} dataset1Profile - JSON string of dataset 1 profile
 * @param {string} dataset2Profile - JSON string of dataset 2 profile
 * @param {Object} tabNames - Tab names { tab1, tab2 }
 * @returns {string} Formatted user prompt
 */
export function createDiscrepancyPrompt(summaryItem, dataset1Profile, dataset2Profile, tabNames) {
  const analysisInstruction = summaryItem.hasMismatch
    ? 'Analyze why these datasets show different aggregated values for this group based on the statistical profiles and data quality indicators.'
    : 'Analyze the consistency and patterns in these matching datasets for this group based on the statistical profiles.';

  return `Group: ${summaryItem.group}

Dataset 1 (${tabNames.tab1}) -
Statistical Profile: ${dataset1Profile}

Dataset 2 (${tabNames.tab2}) -
Statistical Profile: ${dataset2Profile}

${analysisInstruction}`;
}
