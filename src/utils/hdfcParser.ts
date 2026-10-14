import * as XLSX from 'xlsx';

export interface RawParsedRow {
  tempId: string;
  date: string;
  payee: string;
  note: string;
  debit: number;
  credit: number;
  txType: 'DEBIT' | 'CREDIT';
  amount: number;
  detectedBankMode: 'UPI' | 'Card';
}

const DATE_REGEX = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/;

function normalizeDate(raw: string): string | null {
  const clean = String(raw || '').replace(/["']/g, '').trim();
  const match = clean.match(DATE_REGEX);
  if (!match) return null;
  const dd = match[1].padStart(2, '0');
  const mm = match[2].padStart(2, '0');
  let yyyy = match[3];
  if (yyyy.length === 2) {
    yyyy = Number(yyyy) > 50 ? '19' + yyyy : '20' + yyyy;
  }
  return `${yyyy}-${mm}-${dd}`;
}

export function extractCleanPayeeFromHDFC(narration: string): {
  payee: string;
  note: string;
  detectedBankMode: 'UPI' | 'Card';
} {
  const raw = String(narration || '').replace(/\s+/g, ' ').trim();
  const upper = raw.toUpperCase();

  // Detect Card vs UPI strictly from bank narration
  const isCard =
    upper.startsWith('POS ') ||
    upper.startsWith('ECOM ') ||
    upper.includes('DEBIT CARD') ||
    upper.includes('ATM ');
  const detectedBankMode: 'UPI' | 'Card' = isCard ? 'Card' : 'UPI';

  if (upper.startsWith('UPI-')) {
    const parts = raw.split('-').map((p) => p.trim());
    const payee = parts[1] || 'UPI MERCHANT';
    const lastPart = parts[parts.length - 1] || '';
    const isNoise =
      /^\d{6,18}$/.test(lastPart) ||
      lastPart.includes('@') ||
      /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(lastPart) ||
      lastPart.toUpperCase() === payee.toUpperCase();
    const note = isNoise ? '' : lastPart;
    return { payee: payee.toUpperCase(), note, detectedBankMode: 'UPI' };
  }

  const scrubbed = raw
    .replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/g, '')
    .replace(/\b\d{8,18}\b/g, '')
    .replace(/\b\d{4}[Xx*]{4,8}\d{4}\b/g, 'CARD')
    .replace(/[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    payee: scrubbed.slice(0, 36).toUpperCase() || 'MERCHANT',
    note: '',
    detectedBankMode,
  };
}

function parseNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const cleaned = String(val).replace(/["',\s]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseRowsMatrix(rows: unknown[][]): RawParsedRow[] {
  const results: RawParsedRow[] = [];
  let debitCol = 3;
  let creditCol = 4;

  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const lineStr = (rows[i] || []).map((c) => String(c).toLowerCase()).join('|');
    if (
      lineStr.includes('narration') &&
      (lineStr.includes('debit') || lineStr.includes('withdrawal'))
    ) {
      (rows[i] || []).forEach((cell, idx) => {
        const c = String(cell).toLowerCase().trim();
        if (c.includes('debit') || c.includes('withdrawal')) debitCol = idx;
        if (c.includes('credit') || c.includes('deposit')) creditCol = idx;
      });
      break;
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 3) continue;

    const dateStr = normalizeDate(String(row[0]));
    if (!dateStr) continue;
    if (dateStr < '2025-08-01') continue;

    const narration = String(row[1] || '').trim();
    if (!narration || /opening balance|closing balance|statement summary/i.test(narration))
      continue;

    let debit = parseNumber(row[debitCol]);
    let credit = parseNumber(row[creditCol]);

    if (debit === 0 && credit === 0 && row.length >= 6) {
      const col2IsDate = normalizeDate(String(row[2])) !== null;
      debit = parseNumber(row[col2IsDate ? 3 : 4]);
      credit = parseNumber(row[col2IsDate ? 4 : 5]);
    }

    if (debit <= 0 && credit <= 0) continue;

    const { payee, note, detectedBankMode } = extractCleanPayeeFromHDFC(narration);
    const txType = credit > 0 ? 'CREDIT' : 'DEBIT';
    const amount = credit > 0 ? credit : debit;

    results.push({
      tempId: `row_${i}_${Date.now()}`,
      date: dateStr,
      payee,
      note,
      debit,
      credit,
      txType,
      amount,
      detectedBankMode,
    });
  }

  return results;
}

export async function parseHDFCStatementFile(file: File): Promise<RawParsedRow[]> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.txt') || fileName.endsWith('.csv')) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

    let delimiter: string | RegExp = ',';
    const sampleHeader = lines.find((l) => /narration/i.test(l)) || lines[0] || '';
    if (sampleHeader.includes('\t')) delimiter = '\t';
    else if (sampleHeader.includes('|')) delimiter = '|';
    else if (sampleHeader.includes('~')) delimiter = '~';

    const matrix = lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));
    const parsedFromText = parseRowsMatrix(matrix);
    if (parsedFromText.length > 0) return parsedFromText;
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', raw: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
  return parseRowsMatrix(rows);
}