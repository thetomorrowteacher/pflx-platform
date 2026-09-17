// PATCH v230 proxy test -- server-side ElevenLabs voice (action: 'tts').
// Usage: node test_proxy_tts_v230.mjs path/to/pflx-ai.js
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const src = process.argv[2];
let pass = 0, fail = 0;
const check = (l, c, x) => { if (c) { pass++; console.log('PASS: ' + l); } else { fail++; console.log('FAIL: ' + l + (x !== undefined ? '  [' + JSON.stringify(x).slice(0, 400) + ']' : '')); } };
async function load(env, tag) {
  for (const k of ['ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID', 'ELEVENLABS_MODEL', 'PFLX_TTS_PER_MIN', 'PFLX_TTS_PER_HOUR']) delete process.env[k];
  Object.assign(process.env, env);
  const tmp = path.join(os.tmpdir(), 'pflx-ai-v230-' + tag + '-' + Date.now() + '.mjs');
  fs.writeFileSync(tmp, fs.readFileSync(src, 'utf8'));
  return (await import(tmp)).default;
}
let script = [], sent = [];
globalThis.fetch = async (url, opts) => {
  sent.push({ url, headers: opts.headers, body: JSON.parse(opts.body) });
  const st = script.length ? script.shift() : { status: 200, audio: 'MP3DATA' };
  return { ok: st.status < 300, status: st.status, json: async () => st.json || {}, arrayBuffer: async () => new TextEncoder().encode(st.audio || '').buffer };
};
let ipn = 0; const outs = [];
async function call(handler, body, headers, method = 'POST') {
  const h = {}; let status = 0, out = null, raw = null;
  const res = { setHeader(k, v) { h[k.toLowerCase()] = v; }, status(s) { status = s; return this; }, json(j) { out = j; return this; }, send(b) { raw = b; return this; }, end() { return this; } };
  sent = [];
  await handler({ method, body, headers: headers || { origin: 'https://www.prototypeflx.com', 'x-forwarded-for': '10.2.0.' + (++ipn) } }, res);
  outs.push(JSON.stringify(out || '') + JSON.stringify(h) + (raw ? raw.toString() : ''));
  return { status, out, h, raw, up: sent };
}
const SPEAK = { action: 'tts', text: '  Hello   creators!  ', voiceId: 'EXAVITQu4vr4xnSDxMaL' };

// no key configured
let H = await load({}, 'nokey');
let r = await call(H, SPEAK);
check('no ELEVENLABS_API_KEY -> 503 no-key, no upstream call', r.status === 503 && r.out.error === 'no-key' && r.up.length === 0, r);
r = await call(H, null, {}, 'GET');
check('health reports elevenlabs:false', r.out.providers.elevenlabs === false);

H = await load({ ELEVENLABS_API_KEY: 'el-secret', PFLX_TTS_PER_MIN: '3', PFLX_TTS_PER_HOUR: '5' }, 'key');
r = await call(H, null, {}, 'GET');
check('health reports elevenlabs:true (boolean only)', r.out.providers.elevenlabs === true && !JSON.stringify(r.out).includes('el-secret'));
r = await call(H, SPEAK);
check('speaks: 200 audio/mpeg bytes, no-store', r.status === 200 && r.h['content-type'] === 'audio/mpeg' && r.h['cache-control'] === 'no-store' && r.raw.toString() === 'MP3DATA', r);
check('upstream: key sent server-side only, flash v2.5 model, text trimmed', r.up.length === 1 && r.up[0].headers['xi-api-key'] === 'el-secret' && r.up[0].body.model_id === 'eleven_flash_v2_5' && r.up[0].body.text === 'Hello creators!' && /text-to-speech\/EXAVITQu4vr4xnSDxMaL$/.test(r.up[0].url), r.up);
r = await call(H, Object.assign({}, SPEAK, { voiceId: '../../v1/user' }));
check('bad voice id -> default voice (no path injection)', /text-to-speech\/EXAVITQu4vr4xnSDxMaL$/.test(r.up[0].url), r.up[0] && r.up[0].url);
r = await call(H, Object.assign({}, SPEAK, { text: 'x'.repeat(2000) }));
check('text capped at 500 chars', r.up[0].body.text.length === 500);
r = await call(H, Object.assign({}, SPEAK, { text: '   ' }));
check('empty text -> 400, no upstream call', r.status === 400 && r.up.length === 0);
r = await call(H, SPEAK, { origin: 'https://evil.com', 'x-forwarded-for': '9.9.9.1' });
check('foreign origin -> 403, no upstream call', r.status === 403 && r.up.length === 0);
r = await call(H, SPEAK, { 'x-forwarded-for': '9.9.9.2' });
check('no origin (curl) -> 403', r.status === 403 && r.up.length === 0);

// tighter voice limit per IP: 3/min
const IP = { origin: 'https://www.prototypeflx.com', 'x-forwarded-for': '203.0.113.50' };
const codes = [];
for (let i = 0; i < 4; i++) codes.push((await call(H, SPEAK, IP)).status);
check('voice limit: 3 per minute then 429 busy', codes.join() === '200,200,200,429', codes);
r = await call(H, { provider: 'gemini', prompt: 'hi' }, IP);
check('chat is not blocked by the voice limit', r.status !== 429, r);

// upstream errors
script = [{ status: 400, json: { detail: { status: 'model_deprecated', message: 'The model eleven_flash_v2_5 is not available' } } }];
r = await call(H, SPEAK);
check('model refused -> one retry on eleven_multilingual_v2', r.status === 200 && r.up.map(u => u.body.model_id).join() === 'eleven_flash_v2_5,eleven_multilingual_v2', r.up.map(u => u.body.model_id));
script = [{ status: 401, json: { detail: { status: 'quota_exceeded', message: 'This request exceeds your quota of 10000.' } } }];
r = await call(H, SPEAK);
check('quota exceeded -> 402 billing (friendly)', r.status === 402 && r.out.error === 'billing' && /built-in voice/.test(r.out.message) && r.up.length === 1, r);
script = [{ status: 429, json: { detail: { status: 'too_many_concurrent_requests', message: 'busy' } } }];
r = await call(H, SPEAK);
check('rate limited -> 429 busy + Retry-After', r.status === 429 && r.out.error === 'busy' && r.h['retry-after'] === '30', r);
script = [{ status: 401, json: { detail: { status: 'invalid_api_key', message: 'Invalid API key' } } }];
r = await call(H, SPEAK);
check('bad server key -> 502 tts (no detail leaked)', r.status === 502 && r.out.error === 'tts' && !JSON.stringify(r.out).includes('Invalid API key'), r);
check('ttsKind table', H._test.ttsKind(401, { detail: { status: 'payment_required' } }) === 'billing' && H._test.ttsKind(500, {}) === 'error' && H._test.ttsKind(422, { detail: 'model not found' }) === 'model');
check('the key never appears in any response (' + outs.length + ')', outs.length > 12 && outs.every(o => !o.includes('el-secret')));
console.log(pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
