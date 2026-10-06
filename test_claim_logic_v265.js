// PATCH PLATFORM v265 -- unit test for the REAL Edge Function helpers (logic.ts).
// Usage: node test_claim_logic_v265.js
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'docs/edge-functions/pflx-claim-code/logic.ts'), 'utf8').replace(/^export /gm, '');
const L = new Function(src + '; return {CODE_TTL_MS,MAX_ATTEMPTS,RESEND_COOLDOWN_MS,WINDOW_MS,MAX_SENDS_PER_WINDOW,normalizeEmail,isValidEmail,maskEmail,generateCode,hashCode,timingSafeEqual,rateLimitDecision,findRosterMatch,attemptDecision};')();
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } }
(async () => {
  ok(L.normalizeEmail('  Foo@Bar.COM ') === 'foo@bar.com', 'normalizeEmail trims + lowercases');
  ok(L.isValidEmail('a@b.co') && !L.isValidEmail('a@b') && !L.isValidEmail('a b@c.d') && !L.isValidEmail(''), 'isValidEmail');
  ok(L.maskEmail('ennis@asdubai.org') === 'en*****@asdubai.org', 'maskEmail normal');
  ok(L.maskEmail('a@x.org') === 'a*****@x.org' && L.maskEmail('ab@x.org') === 'a*****@x.org' && L.maskEmail('nope') === '', 'maskEmail short/invalid');
  ok(L.generateCode(0) === '000000' && L.generateCode(1234567) === '234567' && L.generateCode(4294967295) === '967295', 'generateCode 6 digits, zero-padded');
  const h1 = await L.hashCode('123456', 's', 'A@b.co'), h2 = await L.hashCode('123456', 's', 'a@b.co'), h3 = await L.hashCode('123457', 's', 'a@b.co'), h4 = await L.hashCode('123456', 't', 'a@b.co');
  ok(h1 === h2 && /^[0-9a-f]{64}$/.test(h1), 'hashCode deterministic, 64 hex, email-normalised');
  ok(h1 !== h3 && h1 !== h4, 'hashCode changes with code and salt');
  ok(h1 === require('crypto').createHash('sha256').update('s:a@b.co:123456').digest('hex'), 'hashCode == sha256(salt:email:code)');
  ok(L.timingSafeEqual('abc', 'abc') && !L.timingSafeEqual('abc', 'abd') && !L.timingSafeEqual('abc', 'abcd'), 'timingSafeEqual');
  const now = 1e12;
  ok(L.rateLimitDecision([], now).ok === true, 'rate: first send ok');
  let r = L.rateLimitDecision([now - 10000], now);
  ok(!r.ok && r.error === 'cooldown' && r.retryAfterSec === 35, 'rate: cooldown 35s left');
  ok(L.rateLimitDecision([now - 50000], now).ok === true, 'rate: after cooldown ok');
  r = L.rateLimitDecision([now - 50000, now - 120000, now - 300000], now);
  ok(!r.ok && r.error === 'too_many', 'rate: 3 in window -> too_many');
  ok(L.rateLimitDecision([now - 50000, now - 120000, now - 20 * 60 * 1000], now).ok === true, 'rate: old sends fall out of window');
  const roster = [{ id: 'p1', email: 'A@b.co', name: 'A' }, { id: 'p2', email: 'a@b.co' }, { id: 'p3', email: 'c@d.co' }, null];
  ok(L.findRosterMatch(roster, ' a@B.co ').id === 'p1', 'roster: case/space-insensitive first hit');
  ok(L.findRosterMatch(roster, 'a@b.co', 'p2').id === 'p2', 'roster: pinned to player id');
  ok(L.findRosterMatch(roster, 'a@b.co', 'p3') === null, 'roster: id/email mismatch -> null');
  ok(L.findRosterMatch(roster, 'z@z.co') === null && L.findRosterMatch(null, 'a@b.co') === null && L.findRosterMatch(roster, '') === null, 'roster: no match / bad input -> null');
  ok(L.attemptDecision({ used: false, attempts: 0, expires_at_ms: now + 1000 }, now) === 'check', 'attempt: fresh -> check');
  ok(L.attemptDecision({ used: true, attempts: 0, expires_at_ms: now + 1000 }, now) === 'expired', 'attempt: used -> expired');
  ok(L.attemptDecision({ used: false, attempts: 0, expires_at_ms: now - 1 }, now) === 'expired', 'attempt: past expiry -> expired');
  ok(L.attemptDecision({ used: false, attempts: 5, expires_at_ms: now + 1000 }, now) === 'locked', 'attempt: 5 wrong -> locked');
  ok(L.attemptDecision({ used: false, attempts: 4, expires_at_ms: now + 1000 }, now) === 'check', 'attempt: 4 wrong -> still check');
  ok(L.attemptDecision(null, now) === 'expired', 'attempt: no row -> expired');
  ok(L.CODE_TTL_MS === 600000 && L.MAX_ATTEMPTS === 5, 'constants (10 min / 5 tries)');
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
