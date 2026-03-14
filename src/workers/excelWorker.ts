import * as XLSX from 'xlsx';

// Simple hash function for worker
function generateRowHash(row: any): string {
  const values = Object.values(row).map(v => String(v).trim()).join('|');
  let hash = 0;
  for (let i = 0; i < values.length; i++) {
    const char = values.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

self.onmessage = async (e: MessageEvent) => {
  const { file } = e.data;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    const rows = XLSX.utils.sheet_to_json(worksheet) as any[];
    const total = rows.length;
    
    const processedRows = rows.map(row => ({
      data: row,
      hash: generateRowHash(row)
    }));

    self.postMessage({ type: 'DONE', rows: processedRows, total });
  } catch (err) {
    self.postMessage({ type: 'ERROR', error: String(err) });
  }
};
