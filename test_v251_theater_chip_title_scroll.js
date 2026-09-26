// PATCH PLATFORM v251 -- Theater LIVE chip title scroll. Ennis: "The video
// title should scroll." A long title previously hard-truncated with an
// ellipsis ("Don't skip these 6 new Canva f..."), never revealing the rest.
// Extracts the REAL shipped renderChip() via brace-counting and runs it in
// a vm sandbox with a mocked <em> whose scrollWidth/clientWidth simulate
// real post-layout measurements -- never a reimplementation.
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = process.argv[2] || 'preview.html';
const src = fs.readFileSync(path, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('PASS - ' + name); }
  else { fail++; console.log('FAIL - ' + name); }
}

function extractFn(anchor) {
  const idx = src.indexOf(anchor);
  if (idx === -1) throw new Error('anchor not found: ' + anchor);
  const braceStart = src.indexOf('{', idx);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(idx, i);
}

const renderChipSrc = extractFn('function renderChip() {');

// ---- string-level checks ----
ok('renderChip() contains the v251 wiring comment', /video title should scroll/.test(renderChipSrc));
ok('renderChip() measures scrollWidth - clientWidth on the real <em>', /titleEm\.scrollWidth - titleEm\.clientWidth/.test(renderChipSrc));
ok('renderChip() adds ptl-title-scroll only past a 4px threshold (not on tiny rounding noise)', /overflowPx > 4/.test(renderChipSrc));
ok('renderChip() clears ptl-title-scroll when the title fits', /titleEm\.classList\.remove\('ptl-title-scroll'\)/.test(renderChipSrc));

// ---- CSS checks ----
ok('.ptl-title-txt CSS present', /\.ptl-chip em \.ptl-title-txt \{ display:inline-block; white-space:nowrap; \}/.test(src));
ok('ptlTitleScroll keyframes present (ping-pong: 0/10 -> 45/55 -> 90/100)', /@keyframes ptlTitleScroll \{\s*0%, 10%\s*\{ transform: translateX\(0\); \}\s*45%, 55%\s*\{ transform: translateX\(var\(--ptl-scroll-dist,0px\)\); \}\s*90%, 100%\s*\{ transform: translateX\(0\); \}\s*\}/.test(src));
ok('.ptl-title-scroll animation is scoped to the chip (not a global marquee)', /\.ptl-chip em\.ptl-title-scroll \.ptl-title-txt \{ animation: ptlTitleScroll var\(--ptl-scroll-dur,8s\) ease-in-out infinite; \}/.test(src));

// ---- behavioral sandbox ----
function makeChipSandbox(opts) {
  opts = opts || {};
  const emClassList = new Set();
  const emStyleProps = {};
  const state = { emInnerHTML: '', chipInnerHTML: '', appended: false };
  const emEl = {
    scrollWidth: opts.emScrollWidth != null ? opts.emScrollWidth : 100,
    clientWidth: opts.emClientWidth != null ? opts.emClientWidth : 100,
    classList: {
      add: function (c) { emClassList.add(c); },
      remove: function (c) { emClassList.delete(c); },
      contains: function (c) { return emClassList.has(c); }
    },
    style: { setProperty: function (k, v) { emStyleProps[k] = v; } },
    set innerHTML(v) { state.emInnerHTML = v; },
    get innerHTML() { return state.emInnerHTML; }
  };
  const chipEl = {
    id: '', className: 'ptl-chip', style: { display: '' }, onclick: null,
    set innerHTML(v) { state.chipInnerHTML = v; },
    get innerHTML() { return state.chipInnerHTML; },
    querySelector: function (sel) { return sel === 'em' ? emEl : null; }
  };
  const document = {
    getElementById: function (id) { return (id === 'pflx-theater-live-chip' && state.appended) ? chipEl : null; },
    createElement: function () { return chipEl; },
    body: { appendChild: function () { state.appended = true; } }
  };
  const T = { state: null, ownsPip: false };
  function viewer() { return { id: 'player-1' }; }
  const window = { pflxTheaterLiveInScope: function () { return true; }, pflxTheaterLiveOpenPip: function () {} };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  const sandbox = { document, T, viewer, window, esc, console };
  vm.createContext(sandbox);
  return { sandbox, emEl, emClassList, emStyleProps, state };
}

(function () {
  // Case A: a short title that already fits (scrollWidth === clientWidth) -- untouched.
  const { sandbox, emEl, emClassList, state } = makeChipSandbox({ emScrollWidth: 80, emClientWidth: 200 });
  const fn = vm.runInContext('(function () ' + renderChipSrc.slice(renderChipSrc.indexOf('{')) + ')', sandbox);
  sandbox.T.state = { id: 'sess-1', active: true, playlist: [{ title: 'Short Title' }], index: 0 };
  fn();
  ok('short title: no ptl-title-scroll class added', !emClassList.has('ptl-title-scroll'));
  ok('short title: <em> innerHTML never rewritten with a wrapper span', emEl.innerHTML === '');
})();

(function () {
  // Case B: a long title that overflows -- gets wrapped + scroll class + custom properties.
  const { sandbox, emEl, emClassList, emStyleProps } = makeChipSandbox({ emScrollWidth: 340, emClientWidth: 200 }); // overflowPx = 140
  const fn = vm.runInContext('(function () ' + renderChipSrc.slice(renderChipSrc.indexOf('{')) + ')', sandbox);
  sandbox.T.state = { id: 'sess-1', active: true, playlist: [{ title: "Don't skip these 6 new Canva features" }], index: 0 };
  fn();
  ok('long title: ptl-title-scroll class added', emClassList.has('ptl-title-scroll'));
  ok('long title: <em> innerHTML wrapped in .ptl-title-txt with the full escaped title', emEl.innerHTML === '<span class="ptl-title-txt">Don&#39;t skip these 6 new Canva features</span>');
  ok('long title: --ptl-scroll-dist set to -overflowPx (-140px)', emStyleProps['--ptl-scroll-dist'] === '-140px');
  ok('long title: --ptl-scroll-dur computed and clamped (140/22+3 = 9.36s, within [4,14])', Math.abs(parseFloat(emStyleProps['--ptl-scroll-dur']) - (140 / 22 + 3)) < 0.001);
})();

(function () {
  // Case C: a barely-overflowing title (<=4px) stays untouched (avoids animating on rounding noise).
  const { sandbox, emEl, emClassList } = makeChipSandbox({ emScrollWidth: 203, emClientWidth: 200 }); // overflowPx = 3
  const fn = vm.runInContext('(function () ' + renderChipSrc.slice(renderChipSrc.indexOf('{')) + ')', sandbox);
  sandbox.T.state = { id: 'sess-1', active: true, playlist: [{ title: 'Almost Fits' }], index: 0 };
  fn();
  ok('barely-overflowing (3px) title: no scroll class added', !emClassList.has('ptl-title-scroll'));
})();

(function () {
  // Case D: an extreme overflow -- duration clamps at the 14s ceiling.
  const { sandbox, emStyleProps } = makeChipSandbox({ emScrollWidth: 900, emClientWidth: 200 }); // overflowPx = 700
  const fn = vm.runInContext('(function () ' + renderChipSrc.slice(renderChipSrc.indexOf('{')) + ')', sandbox);
  sandbox.T.state = { id: 'sess-1', active: true, playlist: [{ title: 'A Genuinely Enormous Title That Goes On And On' }], index: 0 };
  fn();
  ok('extreme overflow (700px): duration clamps at 14s ceiling, not an unbounded crawl', emStyleProps['--ptl-scroll-dur'] === '14s');
})();

(function () {
  // Case E: previously-scrolling chip re-renders with a now-short title -- class is removed.
  const { sandbox, emEl, emClassList } = makeChipSandbox({ emScrollWidth: 340, emClientWidth: 200 });
  const fn = vm.runInContext('(function () ' + renderChipSrc.slice(renderChipSrc.indexOf('{')) + ')', sandbox);
  sandbox.T.state = { id: 'sess-1', active: true, playlist: [{ title: 'A Long Title That Overflows The Chip Width' }], index: 0 };
  fn();
  ok('setup: long title triggers scroll first', emClassList.has('ptl-title-scroll'));
  emEl.scrollWidth = 80; // simulate the next playlist item having a short title, same clientWidth
  sandbox.T.state = { id: 'sess-1', active: true, playlist: [{ title: 'Short' }], index: 0 };
  fn();
  ok('a subsequent short title removes the scroll class (no stuck animation)', !emClassList.has('ptl-title-scroll'));
})();

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
