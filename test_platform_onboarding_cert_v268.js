// PATCH PLATFORM v268 -- the PFLX User Certification is granted when onboarding finishes.
// Source-level guards; behavioural proof = tests_e2e/claim/t5.py (new signup), t6.py, t7.py (X-Live-only).
const fs = require('fs');
const html = fs.readFileSync(process.argv[2] || 'preview.html', 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m); } }
ok(/PFLX_PATCH\s*=\s*(26[8-9]|2[7-9]\d);/.test(html), 'PFLX_PATCH >= 268');
const f = html.indexOf("document.getElementById('final-pin-btn').addEventListener");
const seg = html.slice(f, f + 20000);
const awardIdx = seg.indexOf('pflxAwardOnboardingSignature({ id: newPlayer.id');
const loginIdx = seg.indexOf('loginUser(newPlayerData.brandName)');
ok(awardIdx > 0 && loginIdx > awardIdx, 'cert is awarded in the final-pin (finish onboarding) handler BEFORE loginUser');
ok(/admin\|host\|teacher\|instructor/.test(seg.slice(awardIdx - 200, awardIdx)), 'host/teacher/instructor/admin roles are skipped');
ok(/window\.activeSession = __prevSes;/.test(seg), 'activeSession is restored after the award');
ok(/__xlOnly/.test(seg) && /_mcCloudFlush\(\)/.test(seg) && /setTimeout\(function \(\) \{ loginUser\(newPlayerData\.brandName\); \}, 2500\)/.test(seg), 'X-Live-only accounts: cloud flushed and redirect delayed so the cert + claim are saved');
const a = html.indexOf('function pflxAwardOnboardingSignature(session)');
const fn = html.slice(a, a + 9000);
ok(/p\.badgeCounts\.signature = \(Number\(p\.badgeCounts\.signature\) \|\| 0\) \+ 1;/.test(fn) && /p\.digitalBadges = \(Number\(p\.digitalBadges\) \|\| 0\) \+ 1;/.test(fn), 'badge counters (digitalBadges, badgeCounts.signature) move with the badge');
ok(/alreadyHas\) return;/.test(fn), 'award is idempotent');
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
