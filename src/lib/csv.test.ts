import test from "node:test";
import assert from "node:assert/strict";
import { parseRosterCsv, csvEscape } from "./csv";

test("parseRosterCsv strips UTF-8 BOM and skips header row", () => {
  const input = "\uFEFFRoll No,Name\r\nBED1-01,Kabir Nair\r\nBED1-02,Diya Gupta\r\n";
  const result = parseRosterCsv(input);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.rows, [
    { rollNo: "BED1-01", name: "Kabir Nair" },
    { rollNo: "BED1-02", name: "Diya Gupta" },
  ]);
});

test("parseRosterCsv unquotes roll numbers and handles escaped quotes", () => {
  const input = '"Roll No","Name"\n"BED1-01","Ravi ""Jr"" Kumar"\n"BED1-02","Priya, Nair"';
  const result = parseRosterCsv(input);
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.rows, [
    { rollNo: "BED1-01", name: 'Ravi "Jr" Kumar' },
    { rollNo: "BED1-02", name: "Priya, Nair" },
  ]);
});

test("parseRosterCsv reports duplicate roll numbers and malformed lines", () => {
  const input = "BED1-01,Aarav\nBED1-01,Duplicate\nMissingComma";
  const result = parseRosterCsv(input);
  assert.equal(result.rows.length, 1);
  assert.equal(result.errors.length, 2);
});

test("csvEscape escapes commas, quotes, and newlines", () => {
  assert.equal(csvEscape("simple"), "simple");
  assert.equal(csvEscape("a,b"), '"a,b"');
  assert.equal(csvEscape('a"b'), '"a""b"');
});
