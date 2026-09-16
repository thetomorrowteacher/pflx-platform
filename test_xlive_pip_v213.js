// PATCH PLATFORM v213 -- X-Live PiP pull-in.
const fs = require('fs'); const vm = require('vm');
const src = fs.readFileSync(process.argv[2] || 'preview.html', 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('PASS: ' + m); } else { fail++; console.log('FAIL: ' + m); } }
const m = /window\.PFLX_PATCH\s*=\s*(\d+)/.exec(src);
ok(m && +m[1] >= 213, 'PFLX_PATCH >= 213');
ok(/data-app="lite"/.test(src) && /allow="[^"]*display-capture[^"]*"[^>]*data-app="lite"/.test(src), 'X-Live iframe may share the screen');
ok(/id="pip-xlive"/.test(src) && /id="pip-xlive-frame"[^>]*allow="[^"]*display-capture/.test(src), 'PiP widget with its own X-Live frame');
ok(/data-pip-drag="pip-xlive"/.test(src) && /data-pip-dir="se" data-pip-id="pip-xlive"/.test(src), 'PiP is draggable + resizable like the others');
ok(/window\.dispatchEvent\(new Event\('pflx-sessions-changed'\)\)/.test(src), 'sessions realtime nudge wakes the PiP watcher');
ok(/'pip=1&session=' \+ encodeURIComponent\(s\.id\)/.test(src), 'PiP loads compact X-Live for the pushed show');
ok(/if \(window\.pflxRole === 'host'\) return;/.test(src), 'hosts are never pulled');
ok(/if \(liteVisible\(\)\) return; \/\/ X-Live is on screen/.test(src), 'no second copy while X-Live is on screen');
ok(/m\.type === 'pflx_xlive_expand'/.test(src), 'expand message opens the X-Live tab');
const blk = /\/\/ ═══ PATCH PLATFORM v213[\s\S]*?\(function \(\) \{([\s\S]*?)\n    \}\)\(\);\n    \/\/ ═══ \/PATCH PLATFORM v213/.exec(src);
ok(!!blk, 'module found');
if (blk) {
  const pick = /window\.pflxXlivePipPick = (function [\s\S]*?\n        \});/.exec(blk[1]);
  ok(!!pick, 'pick() found');
  const ctx = { WINDOW_MS: 120000 };
  vm.createContext(ctx);
  vm.runInContext('var WINDOW_MS = 120000; this.pick = ' + pick[1].replace(/;\s*$/, ''), ctx);
  const n = 1e12;
  const S = (o) => Object.assign({ id: 'a', status: 'active', liveParticipants: [{ id: 'x' }], push: { seq: 2, at: n } }, o);
  ok(ctx.pick([S()], 'x', () => 1, n).id === 'a', 'joined player + newer push -> pull');
  ok(ctx.pick([S()], 'x', () => 2, n) === null, 'already seen -> no');
  ok(ctx.pick([S({ liveParticipants: [{ id: 'y' }] })], 'x', () => 0, n) === null, 'not joined -> no');
  ok(ctx.pick([S({ push: { seq: 2, at: n - 121000 } })], 'x', () => 0, n) === null, 'stale push -> no');
  ok(ctx.pick([S({ status: 'ended' })], 'x', () => 0, n) === null, 'ended show -> no');
  ok(ctx.pick([S({ id: 'old', push: { seq: 5, at: n - 5000 } }), S({ id: 'new', push: { seq: 1, at: n - 1000 } })], 'x', () => 0, n).id === 'new', 'two shows: the latest push wins');
  ok(ctx.pick(null, 'x', () => 0, n) === null && ctx.pick([S()], '', () => 0, n) === null, 'no data / no id -> no');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
