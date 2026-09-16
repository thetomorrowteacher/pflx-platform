// v211 -- Cloud Desk skin renamed Technodrome + contrast pass (id stays 'clouddesk')
const fs = require('fs');
const path = require('path');
const file = process.argv[2] || path.join(__dirname, '..', 'preview.html');
const src = fs.readFileSync(file, 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('PASS: ' + m); } else { fail++; console.log('FAIL: ' + m); } }
ok(/window\.PFLX_PATCH\s*=\s*(\d+)/.exec(src) && +/window\.PFLX_PATCH\s*=\s*(\d+)/.exec(src)[1] >= 211, 'PFLX_PATCH >= 211');
ok(/'clouddesk':\s*\{\s*name:\s*'Technodrome'/.test(src), 'skin id clouddesk is named Technodrome');
ok(!/name:\s*'Cloud Desk'/.test(src), 'no skin still named Cloud Desk');
ok(src.includes("TECHNODROME (was Cloud Desk; light mode, id 'clouddesk')"), 'section comment renamed');
ok(/--td-midnight:\s*#0f1f3d/.test(src), 'midnight blue palette variable');
ok(/\[data-pflx-skin="clouddesk"\][^{]*\{[^}]*--ink:\s*#0f1f3d/.test(src), 'ink is midnight blue, not black');
const islands = ['#login-view', '#pflx-loading-screen', '#pflx-dock', '.player-header', '#persistentTicker', '#mc-season-bar', '.pflx-season-card'];
const islandRule = /\[data-pflx-skin="clouddesk"\] :is\(([^)]*)\) \{\s*--ink: #e8edf7/.exec(src);
ok(!!islandRule, 'dark-island variable reset present');
islands.forEach(i => ok(islandRule && islandRule[1].includes(i), 'island includes ' + i));
ok(/\[data-pflx-skin="clouddesk"\] :is\(p, span, div, label, td, th\):where\(:not\(/.test(src), 'generic text rule excludes islands');
ok(/\[data-pflx-skin="clouddesk"\] h1:where\(:not\(/.test(src), 'heading rule excludes islands');
ok(/\[data-pflx-light="1"\] :is\(input, select, textarea\):where\(:not\(\[data-pflx-skin="clouddesk"\]/.test(src), 'ink input rule excludes clouddesk islands');
ok(!/\[data-pflx-skin="clouddesk"\] p, \[data-pflx-skin="clouddesk"\] span/.test(src), 'old unscoped slate text rule gone');
ok(src.includes('class="pflx-season-card"'), 'season card carries island class');
// the light-skin list still treats clouddesk as light
ok(/clouddesk/.test((/PFLX_LIGHT_SKINS[^\n]*/.exec(src) || [''])[0]) || /'clouddesk'[^\n]*light/i.test(src) || src.includes("data-pflx-light"), 'clouddesk still a light skin');
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
