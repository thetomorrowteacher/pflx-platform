// PATCH PLATFORM v230 -- no ElevenLabs key in the page; voice chat speaks via the PFLX server or the built-in voice.
// Usage: node test_tts_proxy_client_v230.js [preview.html]
const fs = require('fs'); const path = require('path');
const src = fs.readFileSync(process.argv[2] || path.join(__dirname, 'preview.html'), 'utf8');
let pass = 0, fail = 0;
function check(l, c, x) { if (c) { pass++; console.log('PASS: ' + l); } else { fail++; console.log('FAIL: ' + l + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } }
check('patch number is at least 230', +(src.match(/window\.PFLX_PATCH   = (\d+);/) || [])[1] >= 230);
check('no ElevenLabs key-shaped string in the page', !/sk_[a-f0-9]{40,}/.test(src));
check('getElevenLabsKey has no built-in fallback', /function getElevenLabsKey\(\) \{\n\s+return localStorage\.getItem\('pflx_xbot_elevenlabs_key'\) \|\| '';\n\s+\}/.test(src));
check('server voice helper posts action tts to the PFLX proxy', src.indexOf("body: JSON.stringify({ action: 'tts'") > 0 && src.indexOf('window.pflxServerTts = async function (text)') > 0);
check('server voice backs off when unavailable', src.indexOf('window.__pflxTtsOffUntil = Date.now() + (r.status === 429 ? 60000 : 600000);') > 0);
check('voice chat: no personal key -> server, else built-in voice', /if \(!personalKey\) \{\s+audioBlob = await window\.pflxServerTts\(text\);\s+if \(!audioBlob\) \{ xbotSpeakLocal\(text, status\); return; \}/.test(src));
check('personal key sent only from its own browser', src.indexOf("'xi-api-key': personalKey") > 0 && src.indexOf("'xi-api-key': getElevenLabsKey()") < 0);
check('retired eleven_monolingual_v1 no longer used by voice chat', src.indexOf("model_id: 'eleven_flash_v2_5',   // v230") > 0);
check('failures fall back to the built-in voice (3 places)', src.split('xbotSpeakLocal(text, status);').length - 1 === 3);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
