#!/usr/bin/env node
// Post-build patch for @opennextjs/cloudflare 1.20.x (aws 4.2.0).
//
// Bug: .open-next/middleware/handler.mjs calls `import_cookie.default.parse(...)`
// but the bundled `cookie` package (v1) has no default export, so EVERY request
// that reaches the Next 16 proxy/middleware WITH a Cookie header crashes with
// "Cannot read properties of undefined (reading 'parse')" (Worker error 1101).
// __toESM copies named exports onto the namespace, so `import_cookie.parse`
// exists. This script rewrites the call to use it.
//
// Upstream tracking: cookie v1 ESM interop in @opennextjs/aws converters/edge.js.
// Safe to run on every build: no-op when the pattern is absent.
import { readFileSync, writeFileSync } from "fs";

const FILE = ".open-next/middleware/handler.mjs";
const BAD = "import_cookie.default.parse(";
const GOOD = "(import_cookie.default?.parse ?? import_cookie.parse)(";

let src = readFileSync(FILE, "utf8");
const n = src.split(BAD).length - 1;
if (n === 0) {
  console.log("[patch-opennext-cookie] nothing to patch (already fixed or upstream fixed)");
  process.exit(0);
}
src = src.split(BAD).join(GOOD);
writeFileSync(FILE, src);
console.log(`[patch-opennext-cookie] patched ${n} occurrence(s) in ${FILE}`);
