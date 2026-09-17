// PATCH v227 unit test -- X-Gem select screen. Usage: node test_xgem_select_v227.js preview.html
const fs = require('fs');
const file = process.argv[2] || 'preview.html';
const src = fs.readFileSync(file, 'utf8');
let pass = 0, fail = 0;
function check(label, cond, extra) { if (cond) { pass++; console.log('PASS: ' + label); } else { fail++; console.log('FAIL: ' + label + (extra !== undefined ? '  [' + JSON.stringify(extra).slice(0, 300) + ']' : '')); } }

check("PFLX_PATCH is 227 or later", +((/window\.PFLX_PATCH\s*=\s*(\d+);/.exec(src) || [])[1]) >= 227);
const start = src.indexOf('window.pflxXGemSelect = (function () {');
const end = src.indexOf('\n        })();', start);
check('select module present exactly once', start > 0 && end > start && src.indexOf('window.pflxXGemSelect = (function () {', start + 1) < 0);
const mod = src.slice(start, end);
const gemsStart = src.indexOf('window.pflxXGems = (function () {');
check('select module loads after pflxXGems and before the v226 image module', gemsStart > 0 && start > gemsStart && start < src.indexOf('window.pflxXBotImages = (function () {'));
try { new Function(mod + '\n})();'); check('select module parses', true); } catch (e) { check('select module parses', false, String(e)); }

// wiring inside pflxXGems
const gems = src.slice(gemsStart, src.indexOf('\n        })();', gemsStart));
check('API: openSelect / usable / hostView / byId', /openSelect: function \(id\)/.test(gems) && /usable: function \(\)/.test(gems) && /hostView: hostView/.test(gems) && /byId: byId/.test(gems));
check('gem bar: X-Gems chip (next to X-Bot) opens the screen; no editor chip', /xgem-chip add sel[^\n]*pflxXGems\.openSelect\(\)[^\n]*X-Gems<\/button>/.test(gems) && gems.indexOf('onclick="pflxXGems.edit()">＋ X-Gem') < 0);
check('banner mark opens the screen on the active gem', /xgem-selmark[^\n]*pflxXGems\.openSelect\(/.test(gems));
check('renderAll refreshes the screen', /window\.pflxXGemSelect\.refresh\(\)/.test(gems));
check('mark() accepts repo image paths', gems.indexOf('/^(data:image|https:|public\\/)/.test(g.image)') > 0);
check('editor: card art / colour / step / stage fields', ['id="xg-card"', 'id="xg-acc"', 'id="xg-step"', 'id="xg-stage"'].every(s => gems.indexOf(s.replace(/"/g, '\\"')) > 0 || gems.indexOf(s) > 0));
check('editor: pullForm saves accent, step, stage', /g\.accent = v\('xg-acc'\)/.test(gems) && /g\.step = \(stp > 0 && stp < 100\)/.test(gems) && /g\.stage = v\('xg-stage'\)/.test(gems));
check('card art shrunk to 480x600 webp with a size cap', /var W = 480, H = 600/.test(gems) && /image\/webp/.test(gems) && /d\.length > 140000/.test(gems));
check('new X-Gem defaults include card fields', /card: '', accent: '#4c8dff', step: 0, stage: ''/.test(gems));

// select module behaviour (source)
check('no cloud writes from the select module', !/app_data|writeRow|\.upsert\(|saveList/.test(mod));
check('favorites + sort are per-browser conveniences', /pflx_xgem_favs_v1/.test(mod) && /pflx_xgem_sort_v1/.test(mod) && /favKey\(\)/.test(mod));
check('favorites keyed per user', /FAV_LS \+ ':' \+ \(\(s && \(s\.id \|\| s\.brand\)\)/.test(mod));
check('uses the gem list the player may use (usable)', /X\.usable \? X\.usable\(\)/.test(mod));
check('sorts: chain / A-Z / newest', /\['chain', 'Gem chain'\], \['az', 'A → Z'\], \['new', 'Newest'\]/.test(mod));
check('locked placeholder for missing art', /ART COMING SOON/.test(mod) && /xgc-lock/.test(mod));
check('card art sources limited to data:image / https / public/', /function artOk\(u\) \{ return \/\^\(data:image\\\/\(png\|jpe\?g\|webp\|gif\);\|https:\\\/\\\/\|public\\\/\)\/i/.test(mod));
check('all user text escaped in cards', /esc\(g\.name\)/.test(mod) && /esc\(g\.tagline\)/.test(mod) && /esc\(s\)/.test(mod) && !/innerHTML = g\./.test(mod));
check('layer order: dock 100000 < screen 100040 < editor 100060; toasts lifted while open',
    /\.xgsel\{position:fixed;inset:0;z-index:100040;/.test(mod) && /xgem-ov\{position:fixed;inset:0;z-index:100060/.test(src) && /#pflx-dock \{ position:fixed; z-index:100000;/.test(src) && /body\.xgsel-open \.pflx-toast\{z-index:100070\}/.test(mod));
check('dialog semantics + keyboard', /role', 'dialog'/.test(mod) && /aria-modal/.test(mod) && /ArrowRight/.test(mod) && /Escape/.test(mod) && /function trap\(/.test(mod));
check('Esc leaves the editor alone', /if \(document\.getElementById\('xgem-ov'\)\) return;/.test(mod));
check('reduced motion respected', /prefers-reduced-motion:reduce/.test(mod));
check('phone layout (bottom-sheet detail)', /@media \(max-width:760px\)/.test(mod) && /xgdUp/.test(mod));
check('new-surface fonts (Audiowide + Exo 2) loaded once', /family=Audiowide&family=Exo\+2/.test(mod) && /xgsel-font/.test(mod));
check('no Google/Gemini logos drawn', !/googleusercontent|gstatic\.com\/.*logo|gemini.*\.svg/i.test(mod));
console.log(pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
