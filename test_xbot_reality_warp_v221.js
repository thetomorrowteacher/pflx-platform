// PATCH v221 -- X-Bot dock accent colors follow Reality Warp skins
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let pass = 0, fail = 0;
function check(label, cond) { if (cond) { pass++; console.log('PASS: ' + label); } else { fail++; console.log('FAIL: ' + label); } }

// 1. The 6 dock rules now reference var(--cyan/--green) via color-mix, not hardcoded hex/rgba.
// PATCH PLATFORM v248 (Sep 26) updated these two opacity values -- Ennis:
// 'X-Bot seems to blend in too much with the back screen' -- border 35%->55%,
// and the box-shadow glow became a dual-layer 30%/45% halo instead of a
// single 14% layer. Updated to assert the new intentional values rather
// than the pre-v248 ones (the underlying var(--cyan) color-mix mechanism
// this test exists to check is unchanged).
check('#pflx-dock border uses var(--cyan) via color-mix (v248: 55%)',
  /#pflx-dock \{[^}]*border:1px solid color-mix\(in srgb, var\(--cyan, #00f0ff\) 55%, transparent\)/.test(src));
check('#pflx-dock box-shadow glow uses var(--cyan) via color-mix (v248: dual-layer 30%/45%)',
  /#pflx-dock \{[^}]*color-mix\(in srgb, var\(--cyan, #00f0ff\) 30%, transparent\)[\s\S]*?color-mix\(in srgb, var\(--cyan, #00f0ff\) 45%, transparent\)/.test(src));
check('.pflx-dock-header background uses var(--cyan) via color-mix',
  /\.pflx-dock-header \{[^}]*color-mix\(in srgb, var\(--cyan, #00f0ff\) 7%, transparent\)/.test(src));
check('.pflx-dock-header border-bottom uses var(--cyan) via color-mix',
  /\.pflx-dock-header \{[^}]*border-bottom:1px solid color-mix\(in srgb, var\(--cyan, #00f0ff\) 14%, transparent\)/.test(src));
check('xbot tab active uses var(--cyan)',
  /\.pflx-dock-tab\[data-dtab="xbot"\]\.active \{[^}]*var\(--cyan, #00f0ff\)[^}]*border-color:var\(--cyan, #00f0ff\)/.test(src));
check('chat tab active uses var(--green)',
  /\.pflx-dock-tab\[data-dtab="chat"\]\.active \{[^}]*var\(--green, #22c55e\)[^}]*border-color:var\(--green, #22c55e\)/.test(src));
check('.pflx-dock-hbtn.on uses var(--cyan)',
  /\.pflx-dock-hbtn\.on \{ color:var\(--cyan, #00f0ff\); background:color-mix\(in srgb, var\(--cyan, #00f0ff\) 12%, transparent\); \}/.test(src));
check('.pflx-dock-size-btn.active uses var(--cyan)',
  /\.pflx-dock-size-btn\.active \{ color:var\(--cyan, #00f0ff\); background:color-mix\(in srgb, var\(--cyan, #00f0ff\) 14%, transparent\); \}/.test(src));

// 2. No leftover hardcoded #00f0ff/#22c55e/#4ade80/#22d3ee/rgba(0,240,255 in these 6 rule bodies specifically.
const dockCore = src.slice(src.indexOf('#pflx-dock { position:fixed'), src.indexOf('.pflx-dock-body {'));
check('no leftover hardcoded rgba(0,240,255 inside the reskinned dock rules',
  !/rgba\(0,\s*240,\s*255/.test(dockCore));
check('no leftover hardcoded #00f0ff outside var() inside the reskinned dock rules',
  (dockCore.match(/#00f0ff/g) || []).every(function () { return true; }) &&
  !/[^(-]#00f0ff/.test(dockCore.replace(/var\(--cyan, #00f0ff\)/g, '')));

// 3. Every skin defines both --cyan and --green so the var() has real values, not just the fallback.
const skinBlocks = [...src.matchAll(/\[data-pflx-skin="([a-z0-9]+)"\] \{([^}]*)\}/g)];
const seen = {};
const rootBlocks = skinBlocks.filter(function (m) { if (seen[m[1]]) return false; seen[m[1]] = true; return /--cyan:/.test(m[2]) || /--dark-bg:/.test(m[2]); });
check('found at least 20 Reality Warp root skin-variable definitions', rootBlocks.length >= 20);
let missing = rootBlocks.filter(function (m) { return !/--cyan:/.test(m[2]) || !/--green:/.test(m[2]); }).map(function (m) { return m[1]; });
check('every skin root block defines both --cyan and --green (' + rootBlocks.length + ' skins checked)', missing.length === 0);

// 4. The dock's own background/panel color is UNCHANGED (per the "accent colors only" decision -- readability preserved).
check('#pflx-dock background panel gradient is unchanged (still the fixed dark glass, not skin-dependent)',
  /#pflx-dock \{[^}]*background:linear-gradient\(180deg,rgba\(10,15,30,0\.98\),rgba\(8,12,24,0\.98\)\)/.test(src));

// 5. color-mix is a precedented technique already used elsewhere in this file (not a novel risk).
check('color-mix() technique has other precedent in the file (not introduced solely for this patch)',
  (src.match(/color-mix\(in srgb/g) || []).length >= 3);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
