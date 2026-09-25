// PATCH PLATFORM v247 -- Reality Warp skins update: removed 7 skins
// (mushroomkingdom, hyrule, gameboy, godofwar, appleglass, googlematerial,
// msfluent), added 6 new skins (frutigeraero, vaporwave, solarpunk,
// wackypromo, dorfic, steampunk). Follows the same static-regex-against-
// raw-source convention as test_technodrome_skin_v211.js -- this is a
// registry/CSS-authoring patch, not new runtime logic, so there is no
// function to extract and execute.
const fs = require('fs');
const path = require('path');
const file = process.argv[2] || path.join(__dirname, '..', 'preview.html');
const src = fs.readFileSync(file, 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('PASS: ' + m); } else { fail++; console.log('FAIL: ' + m); } }

ok(/window\.PFLX_PATCH\s*=\s*(\d+)/.exec(src) && +/window\.PFLX_PATCH\s*=\s*(\d+)/.exec(src)[1] >= 247, 'PFLX_PATCH >= 247');

const REMOVED = ['mushroomkingdom', 'hyrule', 'gameboy', 'godofwar', 'appleglass', 'googlematerial', 'msfluent'];
const ADDED = ['frutigeraero', 'vaporwave', 'solarpunk', 'wackypromo', 'dorfic', 'steampunk'];
const SURVIVING = ['default', 'afrofuturistic', 'cyberpunk', 'voidwalker', 'clouddesk', 'mechanical',
    'collage', 'neonpulse', 'allblack', 'vadervoid', 'corporate', 'retrofuturistic',
    'nintendored', 'metroidprime', 'splatoon', 'ps1classic', 'ps5cosmic', 'bloodborne', 'bloomberg'];

// ── PFLX_SKINS registry ──
const registryMatch = /var PFLX_SKINS = \{([\s\S]*?)\n\s*\};/.exec(src);
ok(!!registryMatch, 'PFLX_SKINS registry object found');
const registryBody = registryMatch ? registryMatch[1] : '';

REMOVED.forEach(id => ok(!new RegExp("'" + id + "':").test(registryBody), 'registry no longer has removed skin ' + id));
ADDED.forEach(id => ok(new RegExp("'" + id + "':\\s*\\{ name:").test(registryBody), 'registry has new skin ' + id));
SURVIVING.forEach(id => ok(new RegExp("'" + id + "':\\s*\\{ name:").test(registryBody), 'registry still has surviving skin ' + id));

const registryKeyCount = (registryBody.match(/'[a-z0-9]+':\s*\{ name:/g) || []).length;
ok(registryKeyCount === 25, 'registry has exactly 25 entries (26 - 7 + 6), got ' + registryKeyCount);

// New skins carry the exact requested display names
ok(/'frutigeraero':\s*\{ name: 'Frutiger Aero'/.test(registryBody), 'frutigeraero named "Frutiger Aero"');
ok(/'vaporwave':\s*\{ name: 'Vaporwave'/.test(registryBody), 'vaporwave named "Vaporwave"');
ok(/'solarpunk':\s*\{ name: 'Solarpunk'/.test(registryBody), 'solarpunk named "Solarpunk"');
ok(/'wackypromo':\s*\{ name: 'Wacky Promo'/.test(registryBody), 'wackypromo named "Wacky Promo"');
ok(/'dorfic':\s*\{ name: 'DORFic'/.test(registryBody), 'dorfic named "DORFic"');
ok(/'steampunk':\s*\{ name: 'Steampunk'/.test(registryBody), 'steampunk named "Steampunk"');

// ── CSS selectors ──
REMOVED.forEach(id => ok(!src.includes('[data-pflx-skin="' + id + '"]'), 'no CSS selector remains for removed skin ' + id));
ADDED.forEach(id => ok(src.includes('[data-pflx-skin="' + id + '"] {'), 'main CSS block exists for new skin ' + id));
ADDED.forEach(id => ok(src.includes('[data-pflx-skin="' + id + '"] .mc-card {'), '.mc-card rule exists for new skin ' + id));
ADDED.forEach(id => ok(src.includes('[data-pflx-skin="' + id + '"] .mc-btn {'), '.mc-btn rule exists for new skin ' + id));
SURVIVING.filter(id => id !== 'default').forEach(id =>
    ok(src.includes('[data-pflx-skin="' + id + '"]'), 'CSS still present for surviving skin ' + id));

// ── Collateral-damage guards: neighbors of removed skins kept their full rule sets ──
ok(/\[data-pflx-skin="nintendored"\] \.mc-btn \{/.test(src), 'nintendored .mc-btn rule intact (neighbor of removed mushroomkingdom/hyrule)');
ok(/\[data-pflx-skin="metroidprime"\] \{/.test(src) && /\[data-pflx-skin="metroidprime"\] \.mc-btn \{/.test(src), 'metroidprime block intact (neighbor of removed hyrule)');
ok(/\[data-pflx-skin="splatoon"\] \.mc-btn \{/.test(src), 'splatoon .mc-btn rule intact (neighbor of removed gameboy)');
ok(/\[data-pflx-skin="ps5cosmic"\] \.mc-btn \{/.test(src), 'ps5cosmic .mc-btn rule intact (neighbor of removed godofwar)');
ok(/\[data-pflx-skin="bloodborne"\] \.mc-btn \{/.test(src), 'bloodborne .mc-btn rule intact (neighbor of removed godofwar/appleglass)');
ok(/\[data-pflx-skin="bloomberg"\] \.mc-btn \{/.test(src), 'bloomberg .mc-btn rule intact (neighbor of removed msfluent)');

// ── PFLX_LIGHT_SKINS (both occurrences: boot-time check + realityWarp()) ──
const lightMatches = src.match(/\{\s*clouddesk:1,[^}]*\}/g) || [];
ok(lightMatches.length === 2, 'exactly 2 occurrences of the light-skins literal, got ' + lightMatches.length);
lightMatches.forEach((m, i) => {
    ok(!/mushroomkingdom|hyrule|gameboy|appleglass|googlematerial|msfluent/.test(m), 'light-skins literal #' + (i + 1) + ' has no removed skin id');
    ok(/frutigeraero:1/.test(m), 'light-skins literal #' + (i + 1) + ' includes frutigeraero');
    ok(/dorfic:1/.test(m), 'light-skins literal #' + (i + 1) + ' includes dorfic');
    ok(/clouddesk:1/.test(m) && /nintendored:1/.test(m) && /collage:1/.test(m), 'light-skins literal #' + (i + 1) + ' keeps clouddesk/nintendored/collage');
});
// vaporwave/solarpunk/wackypromo/steampunk are deliberately NOT light skins
ok(lightMatches.every(m => !/vaporwave:1|solarpunk:1|wackypromo:1|steampunk:1/.test(m)), 'the 4 dark-background new skins are not in the light-skins list');

// ── Light-mode ink-layer override entries for the 2 light new skins ──
ok(/\[data-pflx-skin="frutigeraero"\] \{ --cyan:/.test(src), 'frutigeraero has a light-mode ink override entry');
ok(/\[data-pflx-skin="dorfic"\] \{ --cyan:/.test(src), 'dorfic has a light-mode ink override entry');
REMOVED.forEach(id => ok(!new RegExp('\\[data-pflx-skin="' + id + '"\\] \\{ --cyan:').test(src), 'no stray light-mode override entry remains for removed skin ' + id));

// ── Divider comments still sane (not asserting exact wording, just presence) ──
ok(src.includes('NINTENDO COLLECTION'), 'Nintendo Collection divider still present');
ok(src.includes('PLAYSTATION COLLECTION'), 'PlayStation Collection divider still present');
ok(src.includes('PREMIUM CORPORATE COLLECTION'), 'Premium Corporate Collection divider still present');
ok(src.includes('AESTHETIC COLLECTION'), 'new Aesthetic Collection divider present');

// ── PFLX_SKINS export + consumer sites untouched (data-driven, should need zero changes) ──
ok(src.includes('window.PFLX_SKINS = PFLX_SKINS;'), 'PFLX_SKINS still exported on window');
ok(/Object\.keys\(PFLX_SKINS\)/.test(src), 'at least one consumer still reads PFLX_SKINS via Object.keys (data-driven UI unchanged)');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
