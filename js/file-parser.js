import * as XLSX from "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm";

export async function parseFile(file) {
  if (!file) throw new Error("No file provided");
  
  const ext = file.name.split('.').pop().toLowerCase();
  const supported = ['csv', 'xlsx', 'txt', 'json', 'log'];
  
  if (!supported.includes(ext)) throw new Error(`Unsupported format. Use: ${supported.join(', ')}`);
  
  return ext === 'csv' || ext === 'xlsx' ? parseStructuredFile(file, ext) : parseTextFile(file, ext);
}

async function parseStructuredFile(file, ext) {
  const buffer = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(buffer, { type: "array" });
  
  const sheets = workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    return { name, headers: data[0] || [], sampleRows: data.slice(1, 11) };
  });
  
  return { name: file.name, type: ext, sheets, _originalFileContent: buffer };
}

async function parseTextFile(file, ext) {
  const text = await readFileAsText(file);
  const lines = text.split('\n').slice(0, 50);
  
  let content = lines.map(line => [line]);
  let headers = ['Content'];
  
  if (ext === 'json') {
    try {
      const json = JSON.parse(text);
      if (Array.isArray(json) && json.length > 0) {
        headers = Object.keys(json[0] || {});
        content = json.slice(0, 10).map(obj => headers.map(h => obj[h]));
      } else {
        content = [['JSON Object'], [JSON.stringify(json, null, 2).slice(0, 1000)]];
      }
    } catch {
      content = [['Raw JSON'], [text.slice(0, 1000)]];
    }
  }
  
  return {
    name: file.name, type: ext,
    sheets: [{ name: file.name, headers, sampleRows: content }],
    _originalFileContent: new TextEncoder().encode(text)
  };
}

const readFileAsText = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Failed to read file as text'));
  reader.readAsText(file);
});

const readFileAsArrayBuffer = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(new Uint8Array(reader.result));
  reader.onerror = () => reject(new Error('Failed to read file as buffer'));
  reader.readAsArrayBuffer(file);
});

export async function parseFileFromUrl(url, filename) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
  
  const blob = await response.blob();
  const file = new File([blob], filename, { type: blob.type });
  return parseFile(file);
}