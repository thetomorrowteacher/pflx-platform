// PATCH v228 unit test -- friendly AI error wording. Usage: node test_ai_errors_v228.js preview.html
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'preview.html', 'utf8');
let pass = 0, fail = 0;
const check = (l, c, x) => { if (c) { pass++; console.log('PASS: ' + l); } else { fail++; console.log('FAIL: ' + l + (x !== undefined ? '  [' + JSON.stringify(x).slice(0, 300) + ']' : '')); } };
check('PFLX_PATCH is 228 or later', (+(/window\.PFLX_PATCH\s*=\s*(\d+);/.exec(src) || [])[1]) >= 228);
const a = src.indexOf('window.pflxAiErr = (function () {');
const b = src.indexOf('\n        })();', a);
if (a < 0) { console.log('FAIL: helper missing'); console.log('0/1 passed'); process.exit(1); }
check('helper present once, before the engine', a > 0 && src.indexOf('window.pflxAiErr = (function () {', a + 1) < 0 && a < src.indexOf('const XBOT_AI = {'));
const code = src.slice(a, b) + '\n        })();';
function load(role) {
  const activeSession = { role }; const window = { activeSession };
  new Function('window', 'activeSession', code)(window, activeSession);
  return window.pflxAiErr;
}
const S = load('student'), H = load('admin');
check('codeOf: proxy codes pass through', ['busy', 'billing', 'origin', 'no-key'].every(c => S.codeOf(400, c) === c));
check('codeOf: 429 quota text = busy', S.codeOf(429, 'You exceeded your current quota') === 'busy');
check('codeOf: prepaid credits text = billing (even on 429)', S.codeOf(429, '{"error":{"message":"Your prepayment credits are depleted."}}') === 'billing');
check('codeOf: 402 = billing', S.codeOf(402, 'whatever') === 'billing');
check('codeOf: plain 500 = unknown', S.codeOf(500, 'boom') === '');
check('summary: unknown failure -> null (hosts still see raw errors)', S.summary(['busy', ''], 'X') === null && S.summary([], 'X') === null);
let r = S.summary(['busy'], 'ProtoDev');
check('busy: plain try-again sentence with the gem name', r.kind === 'busy' && /ProtoDev is busy/.test(r.text) && /Try again in a minute/.test(r.text), r);
r = S.summary(['busy', 'busy', 'busy'], 'X-Bot');
check('busy on every engine -> busy', r.kind === 'busy');
r = S.summary(['billing'], 'ThinkTable');
check('billing (student): no account talk, tells them to tell the host', r.kind === 'billing' && /Let your host know/.test(r.text) && !/Billing|credits|Studio/.test(r.text), r);
r = H.summary(['billing'], 'ThinkTable');
check('billing (host): says where to top up', r.kind === 'billing' && /out of credits/.test(r.text) && /AI Studio/.test(r.text), r);
r = S.summary(['origin'], 'X-Bot');
check('origin (student): points to prototypeflx.com', r.kind === 'origin' && /prototypeflx\.com/.test(r.text) && !/PFLX_ALLOWED_ORIGINS/.test(r.text));
check('origin (host): names the setting', /PFLX_ALLOWED_ORIGINS/.test(H.summary(['origin'], 'X').text));
check('no-key (host): names GEMINI_API_KEY; student: no env var names', /GEMINI_API_KEY/.test(H.summary(['no-key']).text) && !/GEMINI_API_KEY/.test(S.summary(['no-key']).text));
check('billing wins over busy', S.summary(['busy', 'billing'], 'X').kind === 'billing');
check('pflxIsHostTier respected when present', (() => { const w = { pflxIsHostTier: () => true }; new Function('window', 'activeSession', code)(w, { role: 'student' }); return w.pflxAiErr._isHost(); })());

// wiring
check('callProxy attaches code + retryAfter', /__e\.code = window\.pflxAiErr \? window\.pflxAiErr\.codeOf\(resp\.status, data\.error\) : ''/.test(src) && /__e\.retryAfter = data\.retryAfter/.test(src));
check('browser-key Gemini attaches code', /__ge\.code = window\.pflxAiErr \? window\.pflxAiErr\.codeOf\(resp\.status, errBody\)/.test(src));
check('X-Bot collects codes and uses summary before the old quota check', /__codes\.push\(\(err && err\.code\) \|\| ''\)/.test(src) && src.indexOf("window.pflxAiErr.summary(__codes, 'X-Bot')") < src.indexOf('const allQuota ='));
check('X-Gems use summary; students never see raw errors', /window\.pflxAiErr\.summary\(codes, g\.name\)/.test(src) && /if \(!isHost\(\)\) return \{ text: '⚠️ ' \+ g\.name \+ ' couldn\\'t answer right now\. Try again in a minute\.'/.test(src));
check('AI Assist uses summary', /window\.pflxAiErr\.summary\(__codes, 'AI Assist'\)/.test(src));
console.log(pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
