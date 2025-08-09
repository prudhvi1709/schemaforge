import * as XLSX from "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm";

/**
 * Parse uploaded file (CSV, Excel, TXT, JSON, LOG) and extract content and sample data
 * @param {File} file - The uploaded file object
 * @returns {Object} Parsed file data with headers and samples
 */
export async function parseFile(file) {
  if (!file) throw new Error("No file provided");
  
  const fileExtension = file.name.split('.').pop().toLowerCase();
  const supportedFormats = ['csv', 'xlsx', 'txt', 'json', 'log'];
  
  if (!supportedFormats.includes(fileExtension)) 
    throw new Error(`Unsupported file format. Supported: ${supportedFormats.join(', ')}`);
  
  try {
    if (fileExtension === 'csv' || fileExtension === 'xlsx') {
      return await parseStructuredFile(file, fileExtension);
    } else {
      return await parseTextFile(file, fileExtension);
    }
  } catch (error) {
    throw new Error(`Failed to parse file: ${error.message}`);
  }
}

/**
 * Parse structured files (CSV, Excel)
 */
async function parseStructuredFile(file, fileExtension) {
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  
  const sheets = workbook.SheetNames.map(sheetName => {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    const headers = jsonData[0] || [];
    const sampleRows = jsonData.slice(1, 11);
    
    return {
      name: sheetName,
      headers,
      sampleRows
    };
  });
  
  return {
    name: file.name,
    type: fileExtension,
    sheets,
    _originalFileContent: arrayBuffer
  };
}

/**
 * Parse text files (TXT, JSON, LOG)
 */
async function parseTextFile(file, fileExtension) {
  const text = await readFileAsText(file);
  const lines = text.split('\n').slice(0, 50); // First 50 lines for sample
  
  let parsedContent = lines;
  let headers = ['Content'];
  
  if (fileExtension === 'json') {
    try {
      const jsonData = JSON.parse(text);
      if (Array.isArray(jsonData) && jsonData.length > 0) {
        headers = Object.keys(jsonData[0] || {});
        parsedContent = jsonData.slice(0, 10).map(obj => headers.map(h => obj[h]));
      } else {
        parsedContent = [['JSON Object'], [JSON.stringify(jsonData, null, 2).slice(0, 1000)]];
      }
    } catch (e) {
      parsedContent = [['Raw JSON'], [text.slice(0, 1000)]];
    }
  } else {
    parsedContent = lines.map(line => [line]);
  }
  
  return {
    name: file.name,
    type: fileExtension,
    sheets: [{
      name: file.name,
      headers,
      sampleRows: parsedContent
    }],
    _originalFileContent: new TextEncoder().encode(text)
  };
}

/**
 * Read file as text
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
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

/**
 * Load and parse data from a URL
 * @param {string} url - The URL to fetch data from
 * @param {string} fileName - The name to use for the file
 * @returns {Promise<Object>} Parsed file data with headers and samples
 */
export async function parseFileFromUrl(url, fileName) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
    }
    
    // Determine file type from URL or default to CSV
    const urlParts = url.split('.');
    const fileExtension = urlParts[urlParts.length - 1]?.toLowerCase() || 'csv';
    
    if (fileExtension !== 'csv' && fileExtension !== 'xlsx') {
      throw new Error("Unsupported file format. Please use CSV or Excel files.");
    }
    
    // For CSV files, we need to handle them differently
    if (fileExtension === 'csv') {
      const text = await response.text();
      return parseCSVFromText(text, fileName);
    }
    
    // For Excel files, use the existing XLSX parsing
    const arrayBuffer = await response.arrayBuffer();
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
      name: fileName,
      type: fileExtension,
      sheets,
      _originalFileContent: arrayBuffer
    };
    
    return result;
  } catch (error) {
    throw new Error(`Failed to parse file from URL: ${error.message}`);
  }
}

/**
 * Parse CSV data from text
 * @param {string} text - CSV text content
 * @param {string} fileName - The name to use for the file
 * @returns {Object} Parsed file data with headers and samples
 */
function parseCSVFromText(text, fileName) {
  try {
    const lines = text.trim().split('\n');
    if (lines.length === 0) {
      throw new Error("Empty CSV file");
    }
    
    // Parse headers (first line)
    const headers = parseCSVLine(lines[0]);
    
    // Parse sample rows (next 10 rows max)
    const sampleRows = lines.slice(1, 11).map(line => parseCSVLine(line));
    
    const result = {
      name: fileName,
      type: 'csv',
      sheets: [{
        name: 'Sheet1',
        headers,
        sampleRows
      }],
      _originalFileContent: new TextEncoder().encode(text)
    };
    
    return result;
  } catch (error) {
    throw new Error(`Failed to parse CSV: ${error.message}`);
  }
}

/**
 * Parse a single CSV line, handling quoted values
 * @param {string} line - CSV line to parse
 * @returns {Array} Array of values
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}