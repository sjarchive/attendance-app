// Shared roster CSV parsing for the bulk import (Phase 2).
// Format: two columns per line — roll number, name (comma separated).
// A header row ("roll", "no", "name") is optional and auto-detected.

export interface CsvRow {
  rollNo: string;
  name: string;
}

export interface CsvParseResult {
  rows: CsvRow[];
  errors: { line: number; message: string }[]; // parse-level errors only
}

const HEADER_HINTS = ["roll", "name", "no", "number"];

export function parseRosterCsv(text: string, maxRows = 1000): CsvParseResult {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const rows: CsvRow[] = [];
  const errors: { line: number; message: string }[] = [];
  let lineNo = 0;
  let seenInFile = new Set<string>();

  for (const raw of lines) {
    lineNo += 1;
    const line = raw.trim();
    if (!line) continue;

    if (rows.length >= maxRows) {
      errors.push({ line: lineNo, message: `File exceeds the ${maxRows}-row limit — remaining lines ignored` });
      break;
    }

    const firstComma = line.indexOf(",");
    if (firstComma === -1) {
      errors.push({ line: lineNo, message: "Expected two columns: roll number, name" });
      continue;
    }

    const rollNo = line.slice(0, firstComma).trim();
    const name = line
      .slice(firstComma + 1)
      .trim()
      .replace(/^"|"$/g, "")
      .trim();

    // Auto-detect and skip a header row
    if (rows.length === 0) {
      const lower = line.toLowerCase();
      const looksLikeHeader =
        HEADER_HINTS.some((h) => lower.startsWith(h)) &&
        HEADER_HINTS.filter((h) => lower.includes(h)).length >= 2;
      if (looksLikeHeader) continue;
    }

    if (!rollNo) {
      errors.push({ line: lineNo, message: "Roll number is empty" });
      continue;
    }
    if (rollNo.length > 20) {
      errors.push({ line: lineNo, message: "Roll number is longer than 20 characters" });
      continue;
    }
    if (!name || name.length < 2) {
      errors.push({ line: lineNo, message: "Student name is missing or too short" });
      continue;
    }
    if (name.length > 80) {
      errors.push({ line: lineNo, message: "Student name is longer than 80 characters" });
      continue;
    }
    if (seenInFile.has(rollNo)) {
      errors.push({ line: lineNo, message: `Duplicate roll number ${rollNo} in file — line skipped` });
      continue;
    }

    seenInFile.add(rollNo);
    rows.push({ rollNo, name });
  }

  return { rows, errors };
}

// CSV escaping for the export
export function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
