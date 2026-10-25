// CSV / TSV parsing and writing for the question bank (no dependencies, runs in node for tests).
// Handles what spreadsheets actually produce: a UTF-8 BOM, quoted cells with commas, doubled quotes
// and line breaks, CRLF line ends, and tab-separated text pasted from Excel or Google Sheets.

// text → rows of cells, each row also remembers its 1-based line number in the source
export function parseCSV(text, delimiter = guessDelimiter(text)) {
  text = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [], cell = '', quoted = false, line = 1, rowLine = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else { if (c === '\n') line++; cell += c; }
      continue;
    }
    if (c === '"' && cell.trim() === '') { quoted = true; cell = ''; }
    else if (c === delimiter) { row.push(cell); cell = ''; }
    else if (c === '\r') { /* CRLF: the \n ends the row */ }
    else if (c === '\n') { row.push(cell); rows.push(Object.assign(row, { line: rowLine })); row = []; cell = ''; line++; rowLine = line; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(Object.assign(row, { line: rowLine })); }
  // drop rows that are completely empty
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

// a tab on the first line means a paste from a spreadsheet; ';' is what European Excel writes
export function guessDelimiter(text) {
  const first = String(text).replace(/^﻿/, '').split(/\r?\n/).find((l) => l.trim()) || '';
  if (first.includes('\t')) return '\t';
  const commas = (first.match(/,/g) || []).length, semis = (first.match(/;/g) || []).length;
  return semis > commas ? ';' : ',';
}

const needsQuote = (s) => /[",\n\r]/.test(s) || /^\s|\s$/.test(s);
export function toCSV(rows) {
  // BOM so Excel opens the Chinese text as UTF-8
  return '﻿' + rows.map((r) => r.map((x) => {
    const s = x == null ? '' : String(x);
    return needsQuote(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n') + '\r\n';
}
