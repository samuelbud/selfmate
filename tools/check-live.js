#!/usr/bin/env node
// Run right after every publish: node tools/check-live.js <the app's plain link, ending in /exec>
// Google rewrites the page when it builds it, and that can break code that works in preview mode.
// This fetches the page as Google really builds it (fake key, no data) and checks that its code can run.
const vm = require('vm');
const link = process.argv[2];
if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(link || '')) {
  console.error('Give the plain app link: node tools/check-live.js https://script.google.com/macros/s/.../exec');
  process.exit(2);
}
fetch(link + '?check=page').then(r => r.text()).then(html => {
  const a = html.lastIndexOf('<script>'), b = html.lastIndexOf('</script>');
  if (a < 0 || b < a || !html.includes('id="boot"')) throw new Error('that was not the SelfMate page: ' + html.slice(0, 120));
  new vm.Script(html.slice(a + 8, b));   // parses only, runs nothing
  console.log('✓ The published page\'s code is valid.');
}).catch(e => {
  console.error('✋ THE PUBLISHED APP WILL NOT START: ' + e.message + '\nPublish the previous version again, then look for "//" inside a text in Index.html.');
  process.exit(1);
});
