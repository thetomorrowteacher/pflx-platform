// PATCH v217 -- X-Bot YouTube: moderation + link parsing + wiring
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let pass = 0, fail = 0;
function check(l, c, x) { if (c) { pass++; console.log('PASS: ' + l); } else { fail++; console.log('FAIL: ' + l + (x !== undefined ? '  [' + JSON.stringify(x) + ']' : '')); } }
const a = src.indexOf('        window.pflxYT = (function () {'), b = src.indexOf('        })();', a);
if (a < 0 || b < 0) { console.log('FAIL: module present'); process.exit(1); }
const sb = { window: {}, document: { getElementById: () => null, addEventListener() {} }, setTimeout: () => 0, console };
sb.window.addEventListener = () => {};
new Function('sb', 'with (sb) {\n' + src.slice(a, b + 13) + '\n}')(sb);
const Y = sb.window.pflxYT;
const cls = q => { const c = Y.classify(q); return c ? c.flag : 'ok'; };
[['how to make a platformer in unity', 'ok'], ['Moby Dick summary', 'ok'], ['Al Gore climate speech', 'review'], ['great tits bird song', 'review'],
 ['essex history', 'ok'], ['peacock feathers', 'ok'], ['shiitake mushrooms', 'ok'], ['scunthorpe fc', 'ok'], ['p0rn', 'blocked'], ['pornhub', 'blocked'],
 ['F U C K', 'ok'], ['fuuuck', 'ok'], ['fucking funny', 'blocked'], ['n.s.f.w clips', 'ok'], ['nsfw clips', 'blocked'], ['how to weed a garden', 'review'],
 ['I want to die', 'wellbeing'], ['self-harm', 'wellbeing'], ['sex education', 'review'], ['python 3 tutorial', 'ok'], ['make a bomb', 'review'],
 ['build a bomb shelter minecraft', 'review'], ['photo shooting tips', 'ok'], ['glue gun crafts', 'ok']].forEach(([q, want]) => {
  check('classify "' + q + '" -> ' + want, cls(q) === want, cls(q));
});
const pl = Y.parseLink;
check('link: playlist url', JSON.stringify(pl('https://www.youtube.com/playlist?list=PLabcdefghijklmnop')) === '{"type":"playlist","id":"PLabcdefghijklmnop"}');
check('link: watch url with list prefers playlist', pl('https://www.youtube.com/watch?v=abcdefghijk&list=PLzzzzzzzzzzzz').type === 'playlist');
check('link: youtu.be', JSON.stringify(pl('https://youtu.be/abcdefghijk?t=3')) === '{"type":"video","id":"abcdefghijk"}');
check('link: shorts', pl('https://youtube.com/shorts/abcdefghijk').id === 'abcdefghijk');
check('link: junk', pl('https://example.com/x') === null);
check('PFLX_PATCH >= 217', +(src.match(/window\.PFLX_PATCH\s*=\s*(\d+)/) || [])[1] >= 217);
check('YouTube key box in X-Bot AI Engine Keys (dock + MC)', src.indexOf('id="xbot-key-youtube"') > 0 && src.indexOf('id="settings-key-youtube"') > 0);
check('save buttons share the key', src.indexOf("window.pflxYT.saveKeyFromInputs('xbot-key-youtube', 'xbot-yt-channel')") > 0 && src.indexOf("window.pflxYT.saveKeyFromInputs('settings-key-youtube', 'settings-yt-channel')") > 0);
check('X-Bot YouTube tab + section', src.indexOf('id="xbot-tab-yt"') > 0 && src.indexOf('id="xbot-yt-root"') > 0 && src.indexOf("} else if (mode === 'yt') {") > 0);
check('MC Settings > X-Bot > YouTube panel', src.indexOf('id="xbot-tab-youtube"') > 0 && src.indexOf('id="pflx-yt-admin"') > 0);
check('Theater search falls back to the shared key', src.indexOf("(window.pflxYT ? window.pflxYT.key() : '')") > 0);
check('modifier awards emit a single popup', src.indexOf("awardObj.source !== 'modifier' && typeof window.pflxEmitXcoinEvent === 'function'") > 0);
check('wellbeing is never fined', /flag === 'wellbeing'[\s\S]{0,400}return logEntry\(\{ kind: 'search', q: q, flag: 'wellbeing'/.test(src));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
