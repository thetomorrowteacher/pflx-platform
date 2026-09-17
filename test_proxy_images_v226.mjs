// PATCH v226 proxy test -- api/pflx-ai.js carries pictures. Usage: node test_proxy_images_v226.mjs path/to/pflx-ai.js
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const src = process.argv[2];
const tmp = path.join(os.tmpdir(), 'pflx-ai-v226-' + Date.now() + '.mjs');
fs.writeFileSync(tmp, fs.readFileSync(src, 'utf8'));
let pass = 0, fail = 0;
const check = (l, c, x) => { if (c) { pass++; console.log('PASS: ' + l); } else { fail++; console.log('FAIL: ' + l + (x !== undefined ? '  [' + JSON.stringify(x).slice(0, 400) + ']' : '')); } };

process.env.GEMINI_API_KEY = 'g-key'; process.env.ANTHROPIC_API_KEY = 'a-key'; process.env.OPENAI_API_KEY = 'o-key'; process.env.DEEPSEEK_API_KEY = 'd-key';
const mod = await import(tmp);
const handler = mod.default;
check('body limit raised to 4mb', mod.config && mod.config.api.bodyParser.sizeLimit === '4mb');

let sent = [];
globalThis.fetch = async (url, opts) => {
  sent.push({ url, body: JSON.parse(opts.body) });
  if (url.includes('generativelanguage')) return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'G' }] } }] }) };
  if (url.includes('anthropic')) return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'A' }] }) };
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'O' } }] }) };
};
async function call(body) {
  let status = 0, out = null;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(j) { out = j; return this; }, end() { return this; } };
  sent = [];
  await handler({ method: 'POST', body, headers: { origin: 'https://prototypeflx.com', 'x-forwarded-for': '10.0.0.' + Math.floor(Math.random()*1e6) } }, res);
  return { status, out, up: sent[0] };
}
const JPG = 'QUJD'.repeat(10);
const pic = (m = 'image/jpeg', d = JPG) => ({ mimeType: m, data: d });

let r = await call({ provider: 'gemini', system: 's', messages: [{ role: 'user', content: 'what is this?', images: [pic()] }] });
const parts = r.up && r.up.body.contents[0].parts;
check('gemini: 200 + text', r.status === 200 && r.out.text === 'G', r);
check('gemini: inline_data then text', parts && parts.length === 2 && parts[0].inline_data.mime_type === 'image/jpeg' && parts[0].inline_data.data === JPG && parts[1].text === 'what is this?', parts);

r = await call({ provider: 'gemini', messages: [{ role: 'user', content: '', images: [pic()] }] });
check('picture-only message is accepted', r.status === 200 && r.up.body.contents[0].parts[1].text === '.', r);

r = await call({ provider: 'anthropic', messages: [{ role: 'user', content: 'look', images: [pic('image/png')] }, { role: 'assistant', content: 'ok', images: [pic()] }, { role: 'user', content: 'more' }] });
const am = r.up && r.up.body.messages;
check('claude: image block + text on the picture turn', am && am[0].content[0].type === 'image' && am[0].content[0].source.media_type === 'image/png' && am[0].content[1].text === 'look', am);
check('claude: assistant pictures ignored, plain turns stay strings', am && am[1].content === 'ok' && am[2].content === 'more', am);
check('claude: no stray images key sent upstream', am && am.every(m => !('images' in m)), am);

r = await call({ provider: 'openai', messages: [{ role: 'user', content: 'look', images: [pic('image/webp')] }] });
const om = r.up && r.up.body.messages[1];
check('openai: text + data-URL image_url', om && om.content[0].type === 'text' && om.content[1].image_url.url === 'data:image/webp;base64,' + JPG, om);

r = await call({ provider: 'deepseek', messages: [{ role: 'user', content: 'look', images: [pic()] }] });
const dm = r.up && r.up.body.messages[1];
check('deepseek: text only', dm && dm.content === 'look' && !('images' in dm), dm);

r = await call({ provider: 'gemini', messages: [{ role: 'user', content: 'x', images: [pic('image/svg+xml'), pic('image/jpeg', 'bad<script>'), pic(), pic(), pic(), pic()] }] });
const gp = r.up.body.contents[0].parts;
check('bad pictures dropped, max 3 kept', gp.filter(p => p.inline_data).length === 3, gp.length);

const huge = 'A'.repeat(2000000);
r = await call({ provider: 'gemini', messages: [{ role: 'user', content: 'old', images: [pic('image/jpeg', huge)] }, { role: 'assistant', content: 'a' }, { role: 'user', content: 'new', images: [pic('image/jpeg', huge)] }] });
const c = r.up.body.contents;
check('3.4 MB budget: newest picture kept, older one noted', c[2].parts.length === 2 && c[0].parts.length === 1 && /picture\(s\) shared earlier/.test(c[0].parts[0].text), c.map(x => x.parts.length));

r = await call({ provider: 'gemini', messages: [{ role: 'user', content: 'plain question' }] });
check('plain text requests unchanged', JSON.stringify(r.up.body.contents) === JSON.stringify([{ role: 'user', parts: [{ text: 'plain question' }] }]), r.up.body.contents);
r = await call({ provider: 'gemini', messages: [{ role: 'user', content: '' }] });
check('empty message still rejected', r.status === 400, r);

fs.unlinkSync(tmp);
console.log(pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
