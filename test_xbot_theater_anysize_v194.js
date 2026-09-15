// Unit tests for PATCH PLATFORM v194: Ennis rejected the Studio-only
// gating on X-Bot's Theater tab ("I don't like this. the video should
// be able to work in any size.") and reported the POP OUT (PIP) button
// as broken ("Also the PIP is not working."). Two independent fixes,
// both extracted verbatim from the real shipped preview.html -- never a
// reimplementation:
//   (a) CSS: .xbot-theater-content is now display:block unconditionally
//       (was gated behind #pflx-dock.pflx-band-studio, same pattern as
//       Teams/Sound/Controller -- but unlike those, a video already
//       scales via a responsive 16:9 box, so the gate was never load-
//       bearing for Theater specifically). Teams/Sound/Controller keep
//       their existing Studio-only gates, confirmed still intact here.
//   (b) JS: the generic .pflx-pip-widget framework's pipOpen() now
//       clamps a widget into the real viewport on open. Root cause: all
//       four PIP remotes ship a fixed pixel left/bottom with no
//       viewport check -- #pip-theater (left:1090, width:380) is fully
//       off-screen below ~1470px window width, which looks exactly like
//       "the PIP is not working" even though pipOpen was firing
//       correctly the whole time.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log('PASS: ' + label); }
  else { fail++; console.log('FAIL: ' + label); }
}

// ── Version bump ──
check('PFLX_PATCH bumped to 194', src.indexOf("window.PFLX_PATCH   = 194;") !== -1);

// ── (a) CSS gating: Theater always visible, Teams/Sound/Controller
// unchanged (still genuinely Studio-gated -- they're real multi-column
// grids, not criticized by Ennis, not touched by this patch) ──
check('.xbot-theater-content is unconditionally display:block (no longer Studio-only)',
  src.indexOf('.xbot-theater-content { display: block; }') !== -1);
check('.xbot-theater-resize-hint is unconditionally display:none (never shown again)',
  src.indexOf('.xbot-theater-resize-hint { display: none; }') !== -1);
check('the old Studio-only override for .xbot-theater-content is gone',
  src.indexOf('#pflx-dock.pflx-band-studio .xbot-theater-content { display: block; }') === -1);
check('the old Studio-only override for .xbot-theater-resize-hint is gone',
  src.indexOf('#pflx-dock.pflx-band-studio .xbot-theater-resize-hint { display: none; }') === -1);
check('Teams grid Studio/Wide gating is untouched (still real, still gated -- a genuine multi-column grid)',
  src.indexOf('#pflx-dock.pflx-band-wide .xbot-teams-grid,\n        #pflx-dock.pflx-band-studio .xbot-teams-grid { display: block; }') !== -1);
check('Sound content Studio-only gating is untouched (still a real pad grid, not criticized by Ennis)',
  src.indexOf('#pflx-dock.pflx-band-studio .xbot-sound-content { display: block; }') !== -1);
check('Controller content Studio-only gating is untouched (still a real pad grid, not criticized by Ennis)',
  src.indexOf('#pflx-dock.pflx-band-studio .xbot-ctrl-content { display: block; }') !== -1);

// ── The Theater panel markup itself is unchanged (same content div,
// same watch/list/playlist rendering target) -- this patch is a pure
// CSS-gating change, no markup rewrite needed. ──
check('#xbot-theater-content markup id is unchanged (JS render target untouched)',
  src.indexOf('<div class="xbot-theater-content" id="xbot-theater-content">') !== -1);

// ── (b) Extract the REAL PIP widget framework IIFE (getWidget through
// the window.pflxPip* exports) verbatim, via brace/string matching. ──
function extractBetween(str, startMarker, endMarker) {
  const start = str.indexOf(startMarker);
  if (start === -1) throw new Error('start marker not found: ' + startMarker);
  const endIdx = str.indexOf(endMarker, start);
  if (endIdx === -1) throw new Error('end marker not found: ' + endMarker);
  return str.slice(start, endIdx + endMarker.length);
}

const START = "(function() {\n            'use strict';\n\n            var PRESETS = { small: 260, medium: 340, large: 480 };";
const END = "window.pflxPipApplyPreset = applyPreset;\n        })();";
const block = extractBetween(src, START, END);

check('pipOpen now calls a real pipClampToViewport function (the fix is actually wired in, not just defined)',
  block.indexOf('pipClampToViewport(w.el)') !== -1);
check('pipClampToViewport is defined in the real extracted block',
  block.indexOf('function pipClampToViewport(el)') !== -1);

// ── Build a minimal DOM-free sandbox around the real block. Mock
// elements expose a controllable getBoundingClientRect() (standing in
// for what a real browser would compute from the CSS the widget
// shipped with) plus a plain `style` object and a no-op classList, so
// pipClampToViewport's actual math is exercised, not reimplemented. ──
function mkEl(rect) {
  return {
    _rect: rect,
    style: {},
    classList: { add: function () {}, remove: function () {}, toggle: function () {} },
    getBoundingClientRect: function () { return this._rect; },
  };
}

function makeSandbox() {
  const elements = {};
  const stubDocument = {
    getElementById: function (id) { return elements[id] || null; },
    querySelectorAll: function () { return []; },
    addEventListener: function () {},
  };
  const win = { innerWidth: 1024, innerHeight: 768 };
  const globalStub = {
    document: stubDocument,
    window: win,
    setTimeout: function (fn) { /* fire synchronously so tests don't need fake timers */ fn(); },
  };
  const fn = new Function('window', 'document', 'setTimeout', block);
  fn(win, stubDocument, globalStub.setTimeout);
  return { win: win, elements: elements, pipOpen: win.pflxPipOpen, pipClose: win.pflxPipClose, pipMinimize: win.pflxPipMinimize, pipIsOpen: win.pflxPipIsOpen };
}

{
  // Reproduce the EXACT real-world bug: #pip-theater's shipped markup is
  // left:1090px, width:380px, bottom:24px -- at a completely ordinary
  // 1024px-wide browser window, its right edge (1090+380=1470) is ~450px
  // past the viewport edge. Confirm pipOpen's clamp pulls it fully
  // on-screen.
  const sb = makeSandbox();
  sb.elements['pip-theater'] = mkEl({ left: 1090, right: 1470, top: 700, bottom: 900, width: 380, height: 200 });
  sb.pipOpen('pip-theater');
  const el = sb.elements['pip-theater'];
  check('pip-theater opens (display set to block)', el.style.display === 'block');
  check('the real-world off-screen-left default (left:1090 at a 1024-wide window) gets clamped so the widget is no longer pushed past the right edge',
    el.style.left !== undefined && parseInt(el.style.left, 10) <= (1024 - 8 - 380) + 1);
  check('clamping never pushes the widget off the LEFT edge either', parseInt(el.style.left, 10) >= 0);
}

{
  // A widget that's already fully within the viewport should be left
  // alone -- the clamp must not "helpfully" reposition something that
  // was never broken.
  const sb = makeSandbox();
  sb.elements['pip-xcoin'] = mkEl({ left: 24, right: 344, top: 600, bottom: 720, width: 320, height: 120 });
  sb.pipOpen('pip-xcoin');
  const el = sb.elements['pip-xcoin'];
  check('a widget already fully on-screen (e.g. #pip-xcoin at left:24 on a 1024-wide window) is left untouched by the clamp',
    el.style.left === undefined && el.style.right === undefined);
}

{
  // A widget positioned above the top edge (rect.top < margin) gets
  // pulled down into view.
  const sb = makeSandbox();
  sb.elements['pip-x'] = mkEl({ left: 100, right: 400, top: -50, bottom: 150, width: 300, height: 200 });
  sb.pipOpen('pip-x');
  const el = sb.elements['pip-x'];
  check('a widget positioned above the top edge is clamped down into view', el.style.top === '8px');
}

{
  // A widget wider than the whole viewport is pinned to the left margin
  // rather than producing a negative/garbage left value.
  const sb = makeSandbox();
  sb.win.innerWidth = 300; // narrower than the widget itself
  sb.elements['pip-x'] = mkEl({ left: 50, right: 430, top: 50, bottom: 250, width: 380, height: 200 });
  sb.pipOpen('pip-x');
  const el = sb.elements['pip-x'];
  check('a widget wider than the viewport is pinned to the left margin, not a negative/garbage position', el.style.left === '8px');
}

{
  // Regression: pipOpen's existing behavior (display/active/minimized
  // state, renderFn invocation) must be unchanged by adding the clamp.
  const sb = makeSandbox();
  sb.elements['pip-x'] = mkEl({ left: 24, right: 344, top: 600, bottom: 720, width: 320, height: 120 });
  let rendered = false;
  sb.pipOpen('pip-x', function () { rendered = true; });
  check('pipOpen still invokes the optional renderFn callback (unchanged)', rendered === true);
  check('pipOpen still reports the widget as open via pipIsOpen (unchanged)', sb.pipIsOpen('pip-x') === true);
  sb.pipClose('pip-x');
  check('pipClose still works after the clamp addition (unchanged)', sb.pipIsOpen('pip-x') === false);
}

{
  // A missing element id is still a safe no-op (getWidget returns null,
  // pipOpen bails before ever touching the clamp).
  const sb = makeSandbox();
  check('opening a nonexistent widget id is a silent no-op, not a crash', (function () { sb.pipOpen('pip-does-not-exist'); return true; })());
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
