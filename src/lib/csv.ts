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

function unquoteCell(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"').trim();
  }
  return trimmed;
}

export function parseRosterCsv(text: string, maxRows = 1000): CsvParseResult {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const rows: CsvRow[] = [];
  const errors: { line: number; message: string }[] = [];
  let lineNo = 0;
  const seenInFile = new Set<string>();

  for (const raw of lines) {
    lineNo += 1;
    const line = raw.trim();
    if (!line) continue;

    if (rows.length >= maxRows) {
      errors.push({
        line: lineNo,
        message: `File exceeds the ${maxRows}-row limit — remaining lines ignored`,
      });
      break;
    }

    const firstComma = line.indexOf(",");
    if (firstComma === -1) {
      errors.push({
        line: lineNo,
        message: "Expected two columns: roll number, name",
      });
      continue;
    }

    const rollNo = unquoteCell(line.slice(0, firstComma));
    const name = unquoteCell(line.slice(firstComma + 1));

    if (rows.length === 0) {
      const lower = `${rollNo},${name}`.toLowerCase();
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
      errors.push({
        line: lineNo,
        message: "Roll number is longer than 20 characters",
      });
      continue;
    }
    if (!name || name.length < 2) {
      errors.push({
        line: lineNo,
        message: "Student name is missing or too short",
      });
      continue;
    }
    if (name.length > 80) {
      errors.push({
        line: lineNo,
        message: "Student name is longer than 80 characters",
      });
      continue;
    }
    if (seenInFile.has(rollNo)) {
      errors.push({
        line: lineNo,
        message: `Duplicate roll number ${rollNo} in file — line skipped`,
      });
      continue;
    }

    seenInFile.add(rollNo);
    rows.push({ rollNo, name });
  }

  return { rows, errors };
}

export function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
