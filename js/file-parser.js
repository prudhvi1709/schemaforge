import * as XLSX from "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm";

/**
 * Parse uploaded file (CSV or Excel) and extract headers and sample data
 * @param {File} file - The uploaded file object
 * @returns {Object} Parsed file data with headers and samples
 */
export async function parseFile(file) {
  if (!file) throw new Error("No file provided");
  
  const fileExtension = file.name.split('.').pop().toLowerCase();
  
  if (fileExtension !== 'csv' && fileExtension !== 'xlsx') 
    throw new Error("Unsupported file format. Please upload a CSV or Excel file.");
  
  try {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    
    // Process each sheet in the workbook
    const sheets = workbook.SheetNames.map(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      // Extract headers (first row) and sample data (next 10 rows max)
      const headers = jsonData[0] || [];
      const sampleRows = jsonData.slice(1, 11);
      
      // Format the data properly
      return {
        name: sheetName,
        headers,
        sampleRows
      };
    });
    
    // Store the original file content for later use (in export)
    const result = {
      name: file.name,
      type: fileExtension,
      sheets,
      _originalFileContent: arrayBuffer
    };
    
    return result;
  } catch (error) {
    throw new Error(`Failed to parse file: ${error.message}`);
  }
}

/**
 * Read a file as ArrayBuffer
 * @param {File} file - File to read
 * @returns {Promise<ArrayBuffer>} File contents as ArrayBuffer
 */
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = e => reject(new Error("Error reading file"));
    reader.readAsArrayBuffer(file);
  });
}