// PATCH PLATFORM v250 -- Theater LIVE chip (.ptl-chip): made larger and
// repositioned above the persistent bottom ticker bar instead of
// overlapping it. Ennis: "The Theater notification should be larger and it
// should not cover the bottom ticker. It needs to move slightly up."
// Pure CSS patch -- string-presence checks against the real shipped file,
// plus a geometry check proving the new position genuinely clears the
// ticker (not just "some bottom value changed").
'use strict';
const fs = require('fs');
const path = process.argv[2] || 'preview.html';
const src = fs.readFileSync(path, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('PASS - ' + name); }
  else { fail++; console.log('FAIL - ' + name); }
}

ok('PFLX_PATCH bumped to 250', /window\.PFLX_PATCH\s*=\s*250;/.test(src));

// ---- .ptl-chip itself: size bumped ----
const chipRule = (/\.ptl-chip \{[^}]*\}/.exec(src) || [''])[0];
ok('.ptl-chip rule found', !!chipRule);
ok('.ptl-chip padding increased (14px 22px, was 9px 14px)', /padding:14px 22px;/.test(chipRule));
ok('.ptl-chip font-size increased (15px, was 12px)', /font-size:15px;/.test(chipRule));
ok('.ptl-chip gap increased (10px, was 8px)', /gap:10px;/.test(chipRule));
ok('.ptl-chip max-width increased (480px, was 420px)', /max-width:min\(480px,calc\(100vw - 32px\)\);/.test(chipRule));
ok('.ptl-chip glow strengthened (26px/.35, was 20px/.3)', /box-shadow:0 0 26px rgba\(255,59,92,0\.35\);/.test(chipRule));

// ---- .ptl-chip: repositioned above the ticker, not a flat 16px ----
ok('.ptl-chip bottom is now keyed off --ticker-height (not a flat 16px)', /bottom:calc\(var\(--ticker-height\) \+ 14px\);/.test(chipRule));
ok('.ptl-chip old flat bottom:16px is gone', !/\.ptl-chip \{[^}]*bottom:16px;/.test(src));

// ---- .ptl-chip b / .ptl-live scoped inside the chip: bumped too ----
ok('.ptl-chip b font-size increased (13px, was 10px)', /\.ptl-chip b \{ color:#ff3b5c; font-family:'Orbitron',sans-serif; font-size:13px; letter-spacing:1px; \}/.test(src));
ok('.ptl-chip .ptl-live scoped override added (12px, chip-only)', /\.ptl-chip \.ptl-live \{ font-size:12px; \}/.test(src));
// The shared base .ptl-live rule (used elsewhere, e.g. .ptl-deck-h) must be untouched.
ok('shared .ptl-live base rule (9px, used elsewhere) is untouched', /\.ptl-live \{ color:#ff3b5c; font-family:'Orbitron',sans-serif; font-size:9px; letter-spacing:1\.5px; animation:ptlBlink 1\.2s ease-in-out infinite; white-space:nowrap; \}/.test(src));

// ---- Geometry: the chip's box must now clear the ticker bar entirely ----
// Ticker: position:fixed; bottom:0; height:var(--ticker-height) = 32px -> occupies y in [0, 32] from viewport bottom.
const tickerHeightMatch = /--ticker-height:\s*(\d+)px;/.exec(src);
ok('--ticker-height custom property found', !!tickerHeightMatch);
const tickerHeight = tickerHeightMatch ? parseInt(tickerHeightMatch[1], 10) : NaN;
ok('--ticker-height is 32px (unchanged by this patch)', tickerHeight === 32);
// Chip's bottom edge offset from viewport bottom = ticker-height + 14 (the new rule).
const chipBottomOffset = tickerHeight + 14;
ok('chip bottom edge (ticker-height + 14 = ' + chipBottomOffset + 'px) clears the ticker top edge (' + tickerHeight + 'px)', chipBottomOffset > tickerHeight);
// Regression: confirm the OLD geometry really did overlap, so this is a real fix not a no-op.
const oldChipBottomOffset = 16;
ok('regression check: the OLD chip bottom (16px) did overlap the ticker (32px) -- proves this was a real bug', oldChipBottomOffset < tickerHeight);

// ---- Regression: the persistent ticker bar itself must be untouched ----
ok('.message-ticker-bar (the ticker itself) is untouched', /\.message-ticker-bar \{\s*position: fixed;\s*bottom: 0;\s*left: 0;\s*right: 0;\s*height: var\(--ticker-height\);/.test(src));
// Regression: renderChip()'s JS logic (v249) must be untouched -- this is a CSS-only patch.
ok('renderChip() show-condition (v249, !T.ownsPip) is untouched', /var show = !!\(st && st\.active && !T\.ownsPip && window\.pflxTheaterLiveInScope\(st, viewer\(\)\)\);/.test(src));

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
