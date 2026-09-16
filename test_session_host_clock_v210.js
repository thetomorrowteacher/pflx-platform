// PATCH PLATFORM v210 -- X-Bot's session bridge uses the same host-clock
// merge as X-Live v0.36 and keeps X-Live's gameshow fields.
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const src = fs.readFileSync(process.argv[2], 'utf8');
let pass = 0, fail = 0;
function check(l, c, x) { if (c) { pass++; console.log('PASS: ' + l); } else { fail++; console.log('FAIL: ' + l + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } }
check('PFLX_PATCH is at least 210', +((src.match(/window\.PFLX_PATCH\s+=\s+(\d+);/) || [])[1]) >= 210);
const a = src.indexOf('        function pflxXBotMergeSession(local, incoming) {');
const b = src.indexOf('        function pflxXBotMergeSessionList(', a);
const ctx = {}; vm.createContext(ctx);
vm.runInContext(src.slice(a, b) + '\nthis.merge = pflxXBotMergeSession;', ctx);
require(path.join(__dirname, 'host_clock_cases.js'))(ctx.merge, check);
const base = { id: 'S', updatedAt: 1, slides: [] };
let m = ctx.merge(Object.assign({}, base, { updatedAt: 9, showTimer: { id: 'old', updatedAt: 1 }, fxEvents: [{ id: 'f1', at: 1 }] }),
                  Object.assign({}, base, { showTimer: { id: 'new', updatedAt: 5 }, fxEvents: [{ id: 'f2', at: 2 }] }));
check('bridge keeps the newer showTimer', m.showTimer.id === 'new');
check('bridge unions fxEvents', m.fxEvents.map(e => e.id).join() === 'f1,f2');
check('bridge saves are host saves', src.indexOf('sess.hostUpdatedAt = sess.updatedAt; // v210') !== -1);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
