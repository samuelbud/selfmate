#!/usr/bin/env node
// Run BEFORE every publish: node tools/check-page.js
// Google rewrites the page when it builds it, and can cut a line at a "//" inside a text, which stops the whole app
// from starting. check-live.js finds that only after the app is already broken; this finds it on this computer first.
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = process.argv[2] || path.join(__dirname, '..', 'apps-script');
const problems = [];
const parses = code => { try { new vm.Script(code); return true; } catch (e) { return false; } };
const firstError = (code, name) => { try { new vm.Script(code, { filename: name }); return ''; } catch (e) { return e.stack.split('\n')[0] + ': ' + e.message; } };

// 1. The page's code
const html = fs.readFileSync(path.join(dir, 'Index.html'), 'utf8');
const a = html.lastIndexOf('<script>'), b = html.lastIndexOf('</script>');
if (a < 0 || b < a) problems.push('Index.html: could not find the page code');
const js = html.slice(a + 8, b), lines = js.split('\n'), offset = html.slice(0, a + 8).split('\n').length - 1;
const whole = firstError(js, 'Index.html');
if (whole) problems.push('The page code has an error: ' + whole + ' (line number counted from the start of the script)');

// 2. Every "//" must be a real comment. Nobody knows exactly when Google cuts: it cut two web addresses in the sample
//    data (2026-11-06, twice) and left others alone. So any new one counts as a problem; these have run fine on the
//    live app, so they are allowed. Only add to this list after check-live.js has passed with the new one published.
const PROVEN = ['https://api.open-meteo.com', 'https://cdn.jsdelivr.net/npm/topojson-client', 'https://cdn.jsdelivr.net/npm/world-atlas',
                'placeholder="https://…"', 'xmlns="http://www.w3.org/2000/svg"'];
const clean = lines.map(l => {
  PROVEN.forEach(p => { l = l.split(p).join(p.replace('//', '/')); });
  return l.replace(/\\\/\\\/\//g, '\\/\\/ /');   // the end of a pattern like /https?:\/\//
});
// Each line with a "//" is tried two ways: cut at the "//" (what the builder may do), and with something invalid
// right after that line (after a real comment that is an error; inside a long text it is just more text).
if (!whole) clean.forEach((line, i) => {
  const at = line.indexOf('//');
  if (at < 0) return;
  const without = repl => clean.slice(0, i).concat(repl, clean.slice(i + 1)).join('\n');
  const inText = !parses(without([line.slice(0, at)])) || parses(without([line, '@']));
  if (inText) problems.push(`Index.html line ${i + 1 + offset}: "//" inside a text. Write it as '/' + '/'. ${lines[i].trim().slice(0, 90)}`);
});

// 3. The server files: valid code, and no BigInt literals like 0n (Google refuses them)
fs.readdirSync(dir).filter(f => f.endsWith('.gs') && !/^Import/.test(f)).forEach(f => {
  const code = fs.readFileSync(path.join(dir, f), 'utf8');
  const err = firstError(code, f);
  if (err) problems.push(f + ': ' + err);
  code.split('\n').forEach((l, i) => { if (/(^|[\s(=,+\-*])\d+n\b(?!['"])/.test(l.split('//')[0])) problems.push(`${f} line ${i + 1}: looks like a BigInt literal, write BigInt(0) instead. ${l.trim().slice(0, 90)}`); });
});

if (problems.length) {
  console.error('✋ DO NOT PUBLISH YET. Found ' + problems.length + ' problem' + (problems.length > 1 ? 's' : '') + ':\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('✓ Safe to publish: the code is valid and every "//" is a real comment.');
