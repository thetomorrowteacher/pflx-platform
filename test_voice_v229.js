// PATCH PLATFORM v229 -- Kokoro voice for X-Bot: static + pure-logic checks.
// Usage: node test_voice_v229.js [preview.html]
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const src = fs.readFileSync(process.argv[2] || path.join(__dirname, 'preview.html'), 'utf8');
let pass = 0, fail = 0;
function check(l, c, x) { if (c) { pass++; console.log('PASS: ' + l); } else { fail++; console.log('FAIL: ' + l + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } }
check('patch number is at least 229', +(src.match(/window\.PFLX_PATCH   = (\d+);/) || [])[1] >= 229);
check('pflxVoice module present once', src.split('window.pflxVoice = (function').length === 2);
check('kokoro-js pinned from jsdelivr', src.indexOf("https://cdn.jsdelivr.net/npm/kokoro-js@1.2.0/+esm") > 0);
check('fp32 on WebGPU, q8 on CPU', /S\.gpu \? 'fp32' : 'q8'/.test(src));
check('software GPUs are not strong devices', src.indexOf('swiftshader|llvmpipe') > 0);
check('read-aloud routed through pflxVoice', src.indexOf("if (window.pflxVoice && text) { window.pflxVoice.speak(text, opts || { mode: 'read' }); return; }") > 0);
check('voice chat asks pflxVoice first, ElevenLabs stays the fallback', src.indexOf('window.pflxVoice.handlesVoiceChat()') > 0 && src.indexOf('api.elevenlabs.io/v1/text-to-speech') > 0);
check('voice chat restarts listening after Kokoro speaks', /mode: 'voice', onend: function \(\) \{[\s\S]{0,200}xbotSpeechRecognition\.start\(\)/.test(src));
check('only the sound window speaks', src.indexOf("if (window.pflxSoundOwner && !window.pflxSoundOwner.here()) { status.textContent = 'Listening...'; return; }") > 0);
check('settings mount point', src.indexOf("d.id = 'pvx-box'") > 0 && src.indexOf("getElementById('xbot-settings-section')") > 0);
// pure helpers
const i = src.indexOf('            function wav(pcm, rate) {'), j = src.indexOf('            function volume() {', i);
const ctx = {}; vm.createContext(ctx);
vm.runInContext(src.slice(i, j) + '\nthis.wav = wav; this.clean = clean; this.chunks = chunks;', Object.assign(ctx, { Blob: function (parts, o) { this.parts = parts; this.type = o.type; } }));
const b = ctx.wav(new Float32Array([0, 1, -1, 0.5]), 24000);
const v = new DataView(b.parts[0]);
check('wav: RIFF header, 24 kHz mono 16-bit', String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3)) === 'RIFF' && v.getUint32(24, true) === 24000 && v.getUint16(22, true) === 1 && v.getUint16(34, true) === 16 && b.type === 'audio/wav');
check('wav: samples clamp to 16-bit', v.getInt16(46, true) === 32767 && v.getInt16(48, true) === -32768 && v.byteLength === 44 + 8);
check('clean: strips markdown, emoji, links', ctx.clean('**Hi** 🎉 see https://x.y/z now', 600) === 'Hi see now', ctx.clean('**Hi** 🎉 see https://x.y/z now', 600));
check('clean: length cap', ctx.clean('a'.repeat(900), 500).length === 500);
const long = 'One. '.repeat(10) + 'x'.repeat(600);
const ch = ctx.chunks(long);
check('chunks: sentences grouped, nothing over 260 chars', ch.every(c => c.length <= 260) && ch.length >= 3, ch.map(c => c.length));
check('chunks: punctuation-only text says nothing', ctx.chunks('... !! ??').length === 0, ctx.chunks('... !! ??'));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
