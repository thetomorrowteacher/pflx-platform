// PATCH PLATFORM v267 -- claiming a host-entered account keeps what the host gave it.
// Source-level guards (the behavioural proof is the Playwright suite in tests_e2e/claim/).
const fs = require('fs');
const html = fs.readFileSync(process.argv[2] || 'preview.html', 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m); } }
const finalIdx = html.indexOf("document.getElementById('final-pin-btn').addEventListener");
const seg = html.slice(finalIdx, finalIdx + 14000);
ok(/PFLX_PATCH\s*=\s*2(6[7-9]|[7-9]\d);/.test(html), 'PFLX_PATCH >= 267');
ok(finalIdx > 0, 'final-pin handler found');
const keepIdx = seg.indexOf("['xc', 'totalXcoin', 'digitalBadges', 'level', 'evoRank', 'rankOverride', 'godTier', 'role', 'roleDisplay']");
const assignIdx = seg.indexOf('Object.assign(newPlayerData.importedPlayer, newPlayer)');
ok(keepIdx > 0 && assignIdx > keepIdx, 'existing xc/badges/level/role carried onto newPlayer BEFORE the record is overwritten');
ok(/if \(__ex\.studioId\) \{ newPlayer\.studioId = __ex\.studioId;/.test(seg), 'host-assigned studio is kept');
ok(/mcPlayers\.find\(function \(x\) \{ return x && x\.id === __cid; \}\)/.test(seg) && seg.indexOf("mcSaveData('players')", seg.indexOf('__cid')) > 0, 'claim is written into the host roster (mcPlayers) by id and saved');
ok(!/__mp2\[k\]\s*=\s*newPlayer\[k\]/.test(seg) || !/'xc'|'totalXcoin'/.test(seg.slice(seg.indexOf('var __mp2'), seg.indexOf('__mp2.updatedAt'))), 'roster sync does not copy earnings fields');
const showIdx = html.indexOf('function pflxShowClaimFound(found)');
const show = html.slice(showIdx, showIdx + 1800);
ok(/if \(found\.email\) newPlayerData\.email = found\.email;/.test(show), 'verified roster email is kept (typed personal email never replaces it)');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
