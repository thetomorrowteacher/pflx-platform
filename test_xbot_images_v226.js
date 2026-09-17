// PATCH v226 unit test -- X-Bot image attach. Usage: node test_xbot_images_v226.js preview.html
const fs = require('fs'), vm = require('vm');
const file = process.argv[2] || 'preview.html';
const src = fs.readFileSync(file, 'utf8');
let pass = 0, fail = 0;
function check(label, cond, extra) { if (cond) { pass++; console.log('PASS: ' + label); } else { fail++; console.log('FAIL: ' + label + (extra !== undefined ? '  [' + JSON.stringify(extra).slice(0, 300) + ']' : '')); } }

check('PFLX_PATCH is 226 or later', +((/window\.PFLX_PATCH\s*=\s*(\d+);/.exec(src) || [])[1]) >= 226);

// ── extract the module ──
const start = src.indexOf('window.pflxXBotImages = (function () {');
const end = src.indexOf('})();', start) + 5;
check('module present exactly once', start > 0 && src.indexOf('window.pflxXBotImages = (function () {', start + 1) < 0);
const code = src.slice(start, end);
const listeners = {};
const fakeEl = () => ({ style: {}, classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, addEventListener(t, f) { listeners[t] = f; }, innerHTML: '', focus() {} });
const els = { 'xbot-chat-input': fakeEl(), 'xbot-chat-messages': fakeEl(), 'xbot-attach-tray': fakeEl(), 'xbot-attach-btn': fakeEl() };
const ctx = { window: {}, document: { readyState: 'complete', getElementById: id => els[id] || null, addEventListener() {}, querySelectorAll: () => [] }, setTimeout: () => 0, URL: {}, console };
vm.createContext(ctx);
vm.runInContext(code, ctx);
const I = ctx.window.pflxXBotImages;
check('module exports its API', I && ['pick', 'take', 'count', 'clean', 'trimHistory', 'geminiParts', 'claudeContent', 'openaiContent', 'proxyMessage', 'canSee', 'showInLastUserBubble'].every(k => typeof I[k] === 'function'));
check('paste + drop are wired on the chat', typeof listeners.paste === 'function' && typeof listeners.drop === 'function' && typeof listeners.dragover === 'function');

const img = (n = 40, mime = 'image/jpeg') => ({ mimeType: mime, data: 'A'.repeat(n) + '==', thumb: 'data:x', name: 'p.png' });
// clean / validate
check('clean keeps valid jpeg/png/webp', I.clean([img(), img(8, 'image/png'), img(8, 'image/webp')]).length === 3);
check('clean drops svg / bad base64 / junk', I.clean([img(8, 'image/svg+xml'), { mimeType: 'image/jpeg', data: 'abc<script>' }, null, 5]).length === 0);
check('clean caps at 3 pictures', I.clean([img(), img(), img(), img()]).length === 3);
check('clean drops oversize (> 2.5 MB base64)', I.clean([{ mimeType: 'image/jpeg', data: 'A'.repeat(2600000) }]).length === 0);

// formats
const um = { role: 'user', content: 'what is this?', images: [img(12)] };
const gp = I.geminiParts(um);
check('gemini: inline_data before the text', gp.length === 2 && gp[0].inline_data && gp[0].inline_data.mime_type === 'image/jpeg' && gp[0].inline_data.data === img(12).data && gp[1].text === 'what is this?', gp);
check('gemini: plain message = one text part', JSON.stringify(I.geminiParts({ role: 'user', content: 'hi' })) === JSON.stringify([{ text: 'hi' }]));
check('gemini: assistant turns never carry pictures', I.geminiParts({ role: 'assistant', content: 'ok', images: [img()] }).length === 1);
const cc = I.claudeContent(um);
check('claude: base64 image block + text', Array.isArray(cc) && cc[0].type === 'image' && cc[0].source.type === 'base64' && cc[0].source.media_type === 'image/jpeg' && cc[1].type === 'text', cc);
check('claude: plain message stays a string', I.claudeContent({ role: 'user', content: 'hi' }) === 'hi');
const oc = I.openaiContent(um);
check('openai: text + data-URL image_url', Array.isArray(oc) && oc[0].type === 'text' && oc[1].type === 'image_url' && oc[1].image_url.url.startsWith('data:image/jpeg;base64,'), oc);
const pm = I.proxyMessage(um);
check('proxy: images = {mimeType,data} only (no thumb/name)', pm.images.length === 1 && Object.keys(pm.images[0]).sort().join() === 'data,mimeType' && pm.content === 'what is this?', pm);
check('proxy: no images key on plain turns', !('images' in I.proxyMessage({ role: 'user', content: 'x' })));

// history trimming
const hist = [];
for (let i = 0; i < 4; i++) { hist.push({ role: 'user', content: 'q' + i, images: [img(10)] }); hist.push({ role: 'assistant', content: 'a' + i }); }
I.trimHistory(hist);
check('only the 2 newest picture turns keep pixels', hist.filter(m => m.images).length === 2 && !!hist[6].images && !!hist[4].images && !hist[2].images && !hist[0].images);
check('dropped turns say a picture was shared', /1 picture shared earlier/.test(I.textOf(hist[0])) && /1 picture shared earlier/.test(I.geminiParts(hist[0]).slice(-1)[0].text));
const big = [{ role: 'user', content: 'old', images: [{ mimeType: 'image/jpeg', data: 'A'.repeat(2000000) }] }, { role: 'user', content: 'new', images: [{ mimeType: 'image/jpeg', data: 'A'.repeat(2000000) }] }];
I.trimHistory(big);
check('total picture budget keeps the newest only', !big[0].images && !!big[1].images);

// engines
check('canSee: gemini/claude/openai yes, local no', I.canSee({}, 'gemini') && I.canSee({}, 'claude') && I.canSee({}, 'openai') && !I.canSee({}, 'local'));
check('take() empties the tray', I.count() === 0 && I.take().length === 0);

// ── static wiring checks ──
check('📷 button + hidden file input + tray in the input area', /id="xbot-attach-tray"[\s\S]{0,400}id="xbot-attach-btn"[\s\S]{0,900}id="xbot-attach-input" accept="image\/\*" multiple[\s\S]{0,200}id="xbot-chat-input"/.test(src));
check('respond(userInput, extra) accepts pictures', /async respond\(userInput, extra\) \{\s*const __IMG = window\.pflxXBotImages;/.test(src));
check('X-Gem persona gets the pictures', src.includes('window.pflxXGems.respondAs(__gem, userInput, this, __images)') && src.includes('async function respondAs(p, input, AI, images)'));
check('respond prefers a vision engine for pictures', /if \(__images\.length && __IMG && !__IMG\.canSee\(this, primary\)\)/.test(src));
check('text-only engine note on both paths', (src.match(/IMG\.NOTE \+ '\\n\\n'/g) || []).length === 2);
check('send path passes pictures on both normal + warned paths', (src.match(/XBOT_AI\.respond\(text, \{ images: __images \}\)/g) || []).length === 2);
check('image-only send gets default text', src.includes("if (!text) text = __images.length === 1 ? 'Here is my picture.' : 'Here are my pictures.';"));
check('send blocked while a picture is still processing', src.includes("if (__IMG && __IMG.busy())"));
check('chat monitor logs 📷×N, never pixels', src.includes("xbotAddMessage._imgNote = __images.length ? ('📷×' + __images.length) : '';") && src.includes('xbotLogMessage(activeSession.name, playerId, __imgNote + text, isUser, modelName);'));
check('all 5 engine callers are picture-aware', ['proxyMessage(m)', 'textOf(m)', 'claudeContent(m)', 'geminiParts(m)', 'openaiContent(m)'].every(k => src.includes('window.pflxXBotImages.' + k)));
check('no picture is ever written to storage', !/localStorage\.setItem\([^)]*(images|__images|pending)/.test(code) && !/from\('app_data'\)/.test(code));

console.log(pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
