#!/usr/bin/env node
// Privacy guard: runs before every commit (see .githooks/pre-commit) and blocks it if a file
// that is about to be uploaded contains personal data. Also: node tools/privacy-check.js --all
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path');
const root = execSync('git rev-parse --show-toplevel').toString().trim();

const PATTERNS = [
  [/\bRO\d{2}[A-Z]{4}[0-9A-Z]{8,}/, 'IBAN'],
  [/[A-Za-z0-9._%+-]+@(?!example\.)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, 'email address'],
  [/\b(?:\d[ -]?){13,19}\b/, 'card-like number'],
  [/\b\d{4}\*{2,}\d*|\*{4}\d{4}\b/, 'masked card number'],
  [/script\.google\.com\/macros\/s\/[\w-]{20,}/, 'private app link'],
  [/[?&]k=[0-9a-f]{20,}/, 'secret link key'],
  [/\b1[\w-]{40,}\b/, 'Google Sheet / Drive ID'],
  [/\b[1-8]\d{12}\b/, 'Romanian personal number (CNP)'],
];
// Extra words that must never appear (names, plates, companies...). Kept only on this computer.
const wordsFile = path.join(root, 'tools', 'private-words.txt');
const WORDS = fs.existsSync(wordsFile) ? fs.readFileSync(wordsFile, 'utf8').split(/\r?\n/).map(w => w.trim()).filter(w => w && !w.startsWith('#')) : [];

const all = process.argv.includes('--all');
const files = (all ? execSync('git ls-files', { cwd: root }) : execSync('git diff --cached --name-only --diff-filter=ACM', { cwd: root }))
  .toString().split('\n').filter(Boolean);
const problems = [];
for (const f of files) {
  if (/(^|\/)(Import\w*\.gs|Config\.gs)$/.test(f) || /bank-exports|\.(pdf|xlsx|csv)$/i.test(f)) { problems.push(`${f}: this file type must never be uploaded`); continue; }
  const full = path.join(root, f);
  if (!fs.existsSync(full) || /\.(png|jpg|ico)$/i.test(f)) continue;
  const lines = fs.readFileSync(full, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const [re, what] of PATTERNS) if (re.test(line)) problems.push(`${f}:${i + 1}: looks like a ${what}`);
    for (const w of WORDS) if (line.toLowerCase().includes(w.toLowerCase())) problems.push(`${f}:${i + 1}: contains a private word ("${w}")`);
  });
}
if (problems.length) {
  console.error('\n✋ Privacy check failed. Nothing was saved. Remove these before committing:\n  ' + problems.join('\n  ') + '\n');
  process.exit(1);
}
console.log(`✓ Privacy check passed (${files.length} file${files.length === 1 ? '' : 's'}).`);
