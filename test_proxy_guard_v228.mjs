// PATCH v228 proxy test -- origin allowlist, per-IP limits, busy/billing errors, Flash-Lite fallback.
// Usage: node test_proxy_guard_v228.mjs path/to/pflx-ai.js
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const src = process.argv[2];
const tmp = path.join(os.tmpdir(), 'pflx-ai-v228-' + Date.now() + '.mjs');
fs.writeFileSync(tmp, fs.readFileSync(src, 'utf8'));
let pass = 0, fail = 0;
const check = (l, c, x) => { if (c) { pass++; console.log('PASS: ' + l); } else { fail++; console.log('FAIL: ' + l + (x !== undefined ? '  [' + JSON.stringify(x).slice(0, 400) + ']' : '')); } };
process.env.GEMINI_API_KEY = 'g-key'; process.env.ANTHROPIC_API_KEY = 'a-key'; process.env.OPENAI_API_KEY = 'o-key';
process.env.PFLX_RATE_PER_MIN = '5'; process.env.PFLX_RATE_PER_HOUR = '8';
process.env.PFLX_ALLOWED_ORIGINS = 'https://extra.example.org/ , https://two.example.org';
const mod = await import(tmp);
const handler = mod.default; const T = handler._test;

// origins
const ok = ['https://prototypeflx.com', 'https://www.prototypeflx.com', 'https://pflx-platform.vercel.app', 'https://pflx-pathway-portal.vercel.app',
  'https://pflx-platform-px2v2u1pm-thetomorrowteachers-projects.vercel.app', 'http://localhost:3001', 'http://127.0.0.1', 'https://extra.example.org', 'https://two.example.org', 'https://thetomorrowteacher.github.io'];
const bad = ['', 'null', 'https://evil.com', 'https://prototypeflx.com.evil.com', 'http://prototypeflx.com', 'https://pflx-evil.vercel.app',
  'https://x-thetomorrowteachers-projects.vercel.app', 'https://localhost', 'http://localhost.evil.com', 'https://notprototypeflx.com'];
check('allowed origins pass (' + ok.length + ')', ok.every(T.originAllowed), ok.filter(o => !T.originAllowed(o)));
check('foreign origins blocked (' + bad.length + ')', bad.every(o => !T.originAllowed(o)), bad.filter(T.originAllowed));

// classify
check('classify: prepaid credits empty = billing', T.classifyUpstream(429, { error: { code: 429, message: 'Your prepayment credits are depleted. Please go to AI Studio', status: 'RESOURCE_EXHAUSTED' } }) === 'billing');
check('classify: 429 quota = busy', T.classifyUpstream(429, { error: { message: 'You exceeded your current quota, please check your plan', status: 'RESOURCE_EXHAUSTED' } }) === 'busy');
check('classify: anthropic 529 overloaded = busy', T.classifyUpstream(529, { error: { type: 'overloaded_error', message: 'Overloaded' } }) === 'busy');
check('classify: openai insufficient_quota = billing', T.classifyUpstream(429, { error: { message: 'You exceeded your current quota', code: 'insufficient_quota', type: 'insufficient_quota' } }) === 'billing');
check('classify: 400 bad request = error', T.classifyUpstream(400, { error: { message: 'Invalid argument', status: 'INVALID_ARGUMENT' } }) === 'error');
check('classify: 403 API disabled = error', T.classifyUpstream(403, { error: { message: 'Gemini API has not been used in project 1 before or it is disabled', status: 'PERMISSION_DENIED' } }) === 'error');

// fake upstream
let script = []; let sent = [];
globalThis.fetch = async (url, opts) => {
  const b = JSON.parse(opts.body); const model = (/models\/([^:]+):/.exec(url) || [])[1];
  sent.push({ url, model, body: b });
  const step = script.length ? script.shift() : { status: 200, json: { candidates: [{ content: { parts: [{ text: 'G:' + model }] } }] } };
  return { ok: step.status < 300, status: step.status, json: async () => { if (step.bad) throw new Error('not json'); return step.json; } };
};
let ipn = 0; const outs = [];
async function call(body, headers, method = 'POST') {
  const h = {}; let status = 0, out = null, ended = false;
  const res = { setHeader(k, v) { h[k.toLowerCase()] = v; }, status(s) { status = s; return this; }, json(j) { out = j; return this; }, end() { ended = true; return this; } };
  sent = [];
  const r0 = await handler({ method, body, headers: headers || { origin: 'https://prototypeflx.com', 'x-forwarded-for': '10.1.0.' + (++ipn) } }, res);
  outs.push(JSON.stringify(out || '') + JSON.stringify(h));
  return { status, out, h, ended, up: sent };
}
const G = { provider: 'gemini', system: 's', prompt: 'hi' };

let r = await call(G);
check('allowed origin: 200 + echoed CORS origin + Vary', r.status === 200 && r.out.text === 'G:gemini-2.5-flash' && r.h['access-control-allow-origin'] === 'https://prototypeflx.com' && r.h['vary'] === 'Origin', r);
check('no wildcard CORS anywhere', r.h['access-control-allow-origin'] !== '*');
r = await call(G, { origin: 'https://evil.com', 'x-forwarded-for': '9.9.9.9' });
check('foreign origin POST: 403 origin, no upstream call, no CORS header', r.status === 403 && r.out.error === 'origin' && r.up.length === 0 && !r.h['access-control-allow-origin'], r);
r = await call(G, { 'x-forwarded-for': '9.9.9.8' });
check('missing origin POST (curl): 403, no upstream call', r.status === 403 && r.up.length === 0, r);
r = await call({ action: 'encrypt', provider: 'gemini', key: 'x' }, { origin: 'https://evil.com' });
check('encrypt action also origin-gated', r.status === 403);
r = await call(null, { origin: 'https://evil.com' }, 'OPTIONS');
check('preflight from foreign origin: 403', r.status === 403 && r.ended);
r = await call(null, { origin: 'https://www.prototypeflx.com' }, 'OPTIONS');
check('preflight from PFLX: 200 with origin echoed', r.status === 200 && r.h['access-control-allow-origin'] === 'https://www.prototypeflx.com');
r = await call(null, {}, 'GET');
check('GET status still open (booleans only) and reports gemini', r.status === 200 && r.out.providers.gemini === true && !JSON.stringify(r.out).includes('g-key'), r.out);

// rate limit: 5/min, 8/hour for one IP
const H = { origin: 'https://prototypeflx.com', 'x-forwarded-for': '203.0.113.7, 10.0.0.1' };
const codes = [];
for (let i = 0; i < 6; i++) codes.push((await call(G, H)).status);
check('per-IP: 5 pass then 429 busy', codes.join(',') === '200,200,200,200,200,429', codes);
r = await call(G, H);
check('limited call: busy message + Retry-After, no upstream call', r.status === 429 && r.out.error === 'busy' && /busy/.test(r.out.message) && Number(r.h['retry-after']) >= 1 && r.up.length === 0, r);
r = await call(G, { origin: 'https://prototypeflx.com', 'x-forwarded-for': '203.0.113.8' });
check('another IP is unaffected', r.status === 200);
const now = Date.now();
check('rateCheck: window slides after a minute', T.rateCheck('198.51.100.1', now).ok && [1,2,3,4].every(() => T.rateCheck('198.51.100.1', now).ok) && !T.rateCheck('198.51.100.1', now).ok && T.rateCheck('198.51.100.1', now + 61000).ok);
check('rateCheck: hourly cap (8) holds after the minute resets', T.rateCheck('198.51.100.1', now + 62000).ok && T.rateCheck('198.51.100.1', now + 63000).ok && !T.rateCheck('198.51.100.1', now + 64000).ok && T.rateCheck('198.51.100.1', now + 3600001).ok);

// gemini quota -> flash-lite fallback
const QUOTA = { status: 429, json: { error: { code: 429, message: 'You exceeded your current quota', status: 'RESOURCE_EXHAUSTED', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '17s' }] } } };
script = [QUOTA];
r = await call(G);
check('gemini 429 -> retried once on gemini-2.5-flash-lite and answered', r.status === 200 && r.out.text === 'G:gemini-2.5-flash-lite' && r.up.map(u => u.model).join() === 'gemini-2.5-flash,gemini-2.5-flash-lite', r);
script = [QUOTA, QUOTA];
r = await call(G);
check('both models out of quota -> 429 busy, Retry-After from RetryInfo (17)', r.status === 429 && r.out.error === 'busy' && r.h['retry-after'] === '17' && r.out.retryAfter === 17 && r.up.length === 2, r);
script = [QUOTA];
r = await call(Object.assign({}, G, { model: 'gemini-2.5-flash-lite' }));
check('already on flash-lite -> no second call', r.status === 429 && r.up.length === 1, r);
script = [{ status: 404, json: { error: { message: 'models/gemini-2.5-flash is no longer available', status: 'NOT_FOUND' } } }, QUOTA];
r = await call(G);
check('404 -> flash-latest -> 429 -> flash-lite (3 calls)', r.status === 200 && r.up.map(u => u.model).join() === 'gemini-2.5-flash,gemini-flash-latest,gemini-2.5-flash-lite', r.up.map(u => u.model));
const BILL = { status: 429, json: { error: { code: 429, message: 'Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.', status: 'RESOURCE_EXHAUSTED' } } };
script = [BILL];
r = await call(G);
check('prepaid credits empty -> 402 billing, no pointless fallback', r.status === 402 && r.out.error === 'billing' && /credits/.test(r.out.message) && r.up.length === 1, r);
script = [{ status: 400, json: { error: { message: 'Invalid argument', status: 'INVALID_ARGUMENT' } } }];
r = await call(G);
check('other upstream error -> 502 with message (unchanged)', r.status === 502 && r.out.error === 'Invalid argument' && r.up.length === 1, r);
script = [{ status: 502, bad: true }];
r = await call(G);
check('non-JSON upstream body -> 502, no crash', r.status === 502 && typeof r.out.error === 'string', r);

// other providers
script = [{ status: 529, json: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } }];
r = await call({ provider: 'claude', prompt: 'hi' });
check('anthropic overloaded -> 429 busy', r.status === 429 && r.out.error === 'busy', r);
script = [{ status: 429, json: { error: { message: 'Rate limit reached for gpt-4o-mini', type: 'requests' } } }];
r = await call({ provider: 'openai', prompt: 'hi' });
check('openai rate limit -> 429 busy', r.status === 429 && r.out.error === 'busy', r);
script = [{ status: 400, json: { error: { message: 'Your credit balance is too low to access the Anthropic API.' } } }];
r = await call({ provider: 'anthropic', prompt: 'hi' });
check('anthropic credit balance -> 402 billing', r.status === 402 && r.out.error === 'billing', r);
check('keys never appear in any response body or header (' + outs.length + ' responses)', outs.length > 20 && outs.every(o => !/g-key|a-key|o-key/.test(o)));

console.log(pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
