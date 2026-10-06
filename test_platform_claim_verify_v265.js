// PATCH PLATFORM v265 -- verified claim flow, tested against the REAL code in preview.html.
// Usage: node test_platform_claim_verify_v265.js preview.html
const fs = require('fs');
const html = fs.readFileSync(process.argv[2] || 'preview.html', 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } }
function grab(name, async_) {
  const re = new RegExp((async_ ? 'async ' : '') + 'function ' + name + '\\(');
  const m = re.exec(html); if (!m) throw new Error('missing ' + name);
  let i = html.indexOf('{', m.index), d = 0, j = i;
  for (; j < html.length; j++) { if (html[j] === '{') d++; else if (html[j] === '}') { d--; if (!d) break; } }
  return html.slice(m.index, j + 1);
}
// ---- structural
ok(/id="step-claim-code"/.test(html), 'step-claim-code exists');
ok(/PFLX_PATCH\s*=\s*265;/.test(html), 'PFLX_PATCH = 265');
const enter = grab('pflxEnterClaimFlow');
ok(/pflxBeginClaimVerify\(/.test(enter) && !/showStep\('step-imported-found'\)/.test(enter), 'pflxEnterClaimFlow is gated by verification');
const show = grab('pflxShowClaimFound');
ok(/showStep\('step-imported-found'\)/.test(show), 'ungated reveal only inside pflxShowClaimFound');
ok(/_legacyClaim \? newPlayerData\.tempPin : '----'/.test(show), 'temp PIN only written to the page in legacy fallback');
const resetIdx = html.indexOf('PATCH PLATFORM v265 -- a reset now needs the emailed code');
const resetBlk = html.slice(resetIdx, resetIdx + 1500);
ok(resetIdx > 0 && /pflxBeginClaimVerify\(found, email/.test(resetBlk), 'claimed-reset path is gated');
ok(/\} else \{\s*showStep\('step-change-pin'\);/.test(resetBlk), 'verified reset goes straight to change-pin (no PIN shown)');
ok(/if \(legacy\) \{[\s\S]*step-temp-pin/.test(resetBlk), 'step-temp-pin only reachable in legacy fallback');
ok(/id="imported-legacy-pin" style="display:none;"/.test(html), 'imported temp PIN hidden by default');
ok(!/Here's your temporary access PIN/.test(html), 'old on-screen PIN copy removed');
// ---- helpers
const win = { PFLX_SUPABASE_URL: 'https://x.supabase.co', PFLX_SUPABASE_ANON: 'ANON' };
const H = new Function('window', grab('pflxMaskEmail') + ';' + grab('pflxClaimApi', true) + ';' + grab('pflxClaimErrorText') + '; return {pflxMaskEmail,pflxClaimApi,pflxClaimErrorText};')(win);
ok(H.pflxMaskEmail('Ennis@ASDubai.org') === 'en*****@asdubai.org' && H.pflxMaskEmail('x') === '', 'client mask matches server mask');
(async () => {
  let seen;
  const f200 = async (url, o) => { seen = { url, o }; return { status: 200, json: async () => ({ ok: true, masked: 'en*****@a.org' }) }; };
  let r = await H.pflxClaimApi('request', { email: 'e@a.org', playerId: 'p1' }, f200);
  ok(r.ok && seen.url === 'https://x.supabase.co/functions/v1/pflx-claim-code', 'api: URL');
  ok(seen.o.headers.Authorization === 'Bearer ANON' && seen.o.headers.apikey === 'ANON', 'api: anon key headers');
  const body = JSON.parse(seen.o.body);
  ok(body.action === 'request' && body.email === 'e@a.org' && body.playerId === 'p1', 'api: body');
  r = await H.pflxClaimApi('verify', {}, async () => { throw new Error('offline'); });
  ok(!r.ok && r.error === 'network', 'api: network failure -> error:network');
  r = await H.pflxClaimApi('verify', {}, async () => ({ status: 502, json: async () => { throw new Error('bad json'); } }));
  ok(!r.ok && r.error === 'server_error', 'api: non-JSON -> server_error');
  r = await H.pflxClaimApi('verify', {}, async () => ({ status: 401, json: async () => ({ ok: false, error: 'wrong_code', attemptsLeft: 3 }) }));
  ok(r.error === 'wrong_code' && r.attemptsLeft === 3 && r.status === 401, 'api: passes error fields through');
  ok(/host/i.test(H.pflxClaimErrorText({ error: 'too_many' })) && /connection/i.test(H.pflxClaimErrorText({ error: 'network' })), 'error text mapping');
  // ---- flow with stub DOM
  const els = {}; const el = id => els[id] || (els[id] = { id, value: '', textContent: '', style: {}, disabled: false, focus() {}, click() {}, addEventListener() {} });
  const doc = { getElementById: el };
  const steps = []; const alerts = [];
  const npd = { email: '', _claimCtx: null };
  let apiReply = { ok: true, masked: 'jo*****@a.org', resendInSec: 45 }, apiCalls = [];
  const code = [grab('pflxClaimMsg'), grab('pflxClaimCountdown'), grab('pflxClaimErrorText'), grab('pflxSendClaimCode', true), grab('pflxBeginClaimVerify')].join(';');
  const F = new Function('document', 'newPlayerData', 'showStep', 'alert', 'pflxClaimApi', 'pflxMaskEmail', 'setInterval', 'clearInterval', 'console',
    'var _pflxClaimTimer=null;' + code + '; return {pflxBeginClaimVerify,pflxSendClaimCode};')(
    doc, npd, s => steps.push(s), m => alerts.push(m), async (a, p) => { apiCalls.push([a, p]); return apiReply; }, H.pflxMaskEmail, () => 1, () => {}, { warn() {} });
  let verified = null;
  F.pflxBeginClaimVerify({ id: 'p1', email: 'joe@a.org' }, 'typed@x.org', l => { verified = l; });
  await new Promise(r => setTimeout(r, 5));
  ok(steps[0] === 'step-claim-code' && apiCalls[0][0] === 'request' && apiCalls[0][1].email === 'joe@a.org' && apiCalls[0][1].playerId === 'p1', 'flow: sends code to the ROSTER email (not the typed one), pinned to player id');
  ok(/jo\*\*\*\*\*@a\.org/.test(els['claim-code-desc'].textContent) && verified === null, 'flow: shows masked address, nothing granted yet');
  // no email on roster
  steps.length = 0; apiCalls.length = 0;
  F.pflxBeginClaimVerify({ id: 'p9', email: '' }, 'typed@x.org', () => { verified = 'BAD'; });
  ok(alerts.length === 1 && steps[0] === 'step-login' && apiCalls.length === 0 && verified === null, 'flow: no roster email -> tells player to ask host, no code sent, no access');
  // not configured -> legacy fallback
  apiReply = { ok: false, error: 'email_not_configured' };
  steps.length = 0; verified = null;
  F.pflxBeginClaimVerify({ id: 'p1', email: 'joe@a.org' }, '', l => { verified = l; });
  await new Promise(r => setTimeout(r, 5));
  ok(verified === true, 'flow: email not configured -> legacy fallback (never dead-ends)');
  // send failure -> stay, no access
  apiReply = { ok: false, error: 'send_failed' };
  verified = null;
  F.pflxBeginClaimVerify({ id: 'p1', email: 'joe@a.org' }, '', l => { verified = l; });
  await new Promise(r => setTimeout(r, 5));
  ok(verified === null && /couldn't send/i.test(els['claim-code-msg'].textContent), 'flow: send failure -> message, no access');
  // cooldown -> treated as sent
  apiReply = { ok: false, error: 'cooldown', retryAfterSec: 20 };
  F.pflxBeginClaimVerify({ id: 'p1', email: 'joe@a.org' }, '', l => { verified = l; });
  await new Promise(r => setTimeout(r, 5));
  ok(verified === null && /just sent/i.test(els['claim-code-msg'].textContent), 'flow: cooldown -> "just sent" message');
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
