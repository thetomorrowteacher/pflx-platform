// Unit tests for PATCH PLATFORM v172: X-Bot Controller foundation (xc-1)
// -- size presets, the sizeBand() classifier, and the render()-driven
// band-class sync. Extracts the REAL shipped code out of preview.html
// via brace/string matching -- never a reimplementation.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

function extractBetween(src, startMarker, endMarker, fromIndex) {
  const start = src.indexOf(startMarker, fromIndex || 0);
  if (start === -1) throw new Error('start marker not found: ' + startMarker);
  const endIdx = src.indexOf(endMarker, start);
  if (endIdx === -1) throw new Error('end marker not found: ' + endMarker);
  return src.slice(start, endIdx + endMarker.length);
}

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log('PASS: ' + label); }
  else { fail++; console.log('FAIL: ' + label); }
}

check('PFLX_PATCH bumped to 172', src.indexOf("window.PFLX_PATCH   = 172;") !== -1);

// ── Build a sandbox around the real dock IIFE's variable/function block,
// from the size-preset declarations through pflxDockApplyPreset, plus
// render(), plus the fields render() depends on (dock/fab/header/state/
// icon/MINW/MINH/COFF/clampSize/clampRectPos/clampIcon/persist). Rather
// than re-deriving every dependency, stub the DOM-touching bits and keep
// the REAL sizeBand()/SIZE_PRESETS/pflxDockApplyPreset()/render() bodies
// verbatim. ──
function makeSandbox() {
  const RENDER_MARKER = '\n        function render() {';
  const blockWithMarker = extractBetween(src, 'var SIZE_PRESETS = {', RENDER_MARKER);
  // Strip the trailing "function render() {" back off -- render() itself
  // is pulled separately below, verbatim, so it isn't declared twice.
  const block = blockWithMarker.slice(0, -RENDER_MARKER.length);
  const renderFn = extractBetween(src, 'function render() {\n            if (!dock) return;', '\n        }');

  // Minimal stand-ins for what render()/pflxDockApplyPreset() touch beyond
  // the size-band logic itself -- these are the SAME globals the real IIFE
  // closes over (dock/fab/header/state/icon/MINW/MINH/COFF and the
  // clamp/persist helpers), stubbed here only because this test runs the
  // extracted snippet outside its enclosing IIFE.
  const state = { x: 0, y: 0, w: 420, h: 560, open: true, tab: 'xbot', autoSpeak: false };
  const icon = { x: 0, y: 0 };
  const MINW = 320, MINH = 300, COFF = 40;
  const persisted = [];
  function persist() { persisted.push({ w: state.w, h: state.h }); }
  function clampSize() { state.w = Math.max(MINW, state.w); state.h = Math.max(MINH, state.h); }
  function clampRectPos() {}
  function clampIcon() {}
  const dockClasses = new Set();
  const dock = {
    classList: {
      add: function (c) { dockClasses.add(c); },
      remove: function (c) { dockClasses.delete(c); },
      toggle: function (c, on) { if (on) dockClasses.add(c); else dockClasses.delete(c); },
      contains: function (c) { return dockClasses.has(c); },
    },
    style: {},
    querySelectorAll: function () { return []; },
  };
  const fab = { style: {}, classList: { toggle: function () {} } };
  const header = { querySelectorAll: function () { return []; } };
  const stubDocument = { querySelectorAll: function () { return []; }, getElementById: function () { return null; }, querySelector: function () { return null; } };

  // `sandbox` is what the extracted code's `window.pflxDockSizeBand = ...`
  // etc. assignments land on (it's the `window` argument below); the
  // trailing lines re-expose everything the assertions need off `sandbox`
  // itself so the outer test code has one flat object to read from.
  const sandbox = { window: {} };
  sandbox.window.activeSession = { id: 'p1' };

  const fullSrc = block + '\n' + renderFn +
    '\nsandbox.sizeBand = sizeBand;' +
    '\nsandbox.SIZE_PRESETS = SIZE_PRESETS;' +
    '\nsandbox.pflxDockApplyPreset = window.pflxDockApplyPreset;' +
    '\nsandbox.pflxDockSizeBand = window.pflxDockSizeBand;' +
    '\nsandbox.render = render;' +
    '\nsandbox.getState = function () { return state; };' +
    '\nsandbox.getDockClasses = function () { return Array.from(dockClasses); };' +
    '\nsandbox.getPersisted = function () { return persisted; };\n';

  const fn = new Function(
    'sandbox', 'window', 'dock', 'fab', 'header', 'state', 'icon', 'MINW', 'MINH', 'COFF', 'persist', 'clampSize', 'clampRectPos', 'clampIcon', 'document', 'dockClasses', 'persisted',
    fullSrc
  );
  fn(sandbox, sandbox.window, dock, fab, header, state, icon, MINW, MINH, COFF, persist, clampSize, clampRectPos, clampIcon, stubDocument, dockClasses, persisted);
  return sandbox;
}

const sb = makeSandbox();

// ── sizeBand(): threshold classification ──
check('width 320 (floor) classifies as compact', sb.sizeBand(320) === 'compact');
check('width 419 classifies as compact (just under the 420 boundary)', sb.sizeBand(419) === 'compact');
check('width 420 (exact boundary) classifies as standard', sb.sizeBand(420) === 'standard');
check('width 679 classifies as standard (just under the 680 boundary)', sb.sizeBand(679) === 'standard');
check('width 680 (exact boundary) classifies as wide', sb.sizeBand(680) === 'wide');
check('width 919 classifies as wide (just under the 920 boundary)', sb.sizeBand(919) === 'wide');
check('width 920 (exact boundary) classifies as studio', sb.sizeBand(920) === 'studio');
check('width 2000 (very wide) still classifies as studio', sb.sizeBand(2000) === 'studio');

// ── SIZE_PRESETS: the four named presets exist with sane dimensions ──
check('SIZE_PRESETS has all four bands', ['compact', 'standard', 'wide', 'studio'].every(b => sb.SIZE_PRESETS[b]));
check('each preset\'s own w classifies back into that SAME band (self-consistent)',
  Object.keys(sb.SIZE_PRESETS).every(name => sb.sizeBand(sb.SIZE_PRESETS[name].w) === name));
check('preset widths strictly increase compact < standard < wide < studio',
  sb.SIZE_PRESETS.compact.w < sb.SIZE_PRESETS.standard.w &&
  sb.SIZE_PRESETS.standard.w < sb.SIZE_PRESETS.wide.w &&
  sb.SIZE_PRESETS.wide.w < sb.SIZE_PRESETS.studio.w);

// ── pflxDockApplyPreset(): applies dimensions, anchors the SE corner,
// persists, and updates the live band class -- via the REAL functions. ──
{
  const state = sb.getState();
  state.x = 100; state.y = 100; state.w = 420; state.h = 560; // start at "standard"
  const rightBefore = state.x + state.w, bottomBefore = state.y + state.h;
  sb.pflxDockApplyPreset('studio');
  check('applying the studio preset sets w/h to the studio preset\'s dimensions',
    state.w === sb.SIZE_PRESETS.studio.w && state.h === sb.SIZE_PRESETS.studio.h);
  check('applying a preset keeps the SE corner anchored (matches manual-resize convention)',
    (state.x + state.w) === rightBefore && (state.y + state.h) === bottomBefore);
  check('the live pflx-band-studio class is applied to the dock after the preset call',
    sb.getDockClasses().indexOf('pflx-band-studio') !== -1);
  check('the now-stale pflx-band-standard class is removed after switching to studio',
    sb.getDockClasses().indexOf('pflx-band-standard') === -1);
  check('applying a preset persists the new size', sb.getPersisted().length > 0);
}

{
  // A manual drag (no preset click at all) still updates the band class,
  // because render() -- the same function drag-resize already calls on
  // every pointermove -- is what does the classification, not a
  // preset-specific code path. This is the "presets you can also
  // free-resize" guarantee: dragging into a range behaves the same as
  // clicking that preset would.
  const state = sb.getState();
  state.w = 700; state.h = 600; // manually dragged into the "wide" range
  sb.render();
  check('a manual resize (render() called directly, no preset click) into the wide range sets pflx-band-wide',
    sb.getDockClasses().indexOf('pflx-band-wide') !== -1);
  check('pflxDockSizeBand() reports the same band as the dock\'s live class after a manual resize',
    sb.pflxDockSizeBand() === 'wide');
}

{
  // An unknown preset name is a no-op, not a crash.
  const state = sb.getState();
  const before = { w: state.w, h: state.h };
  sb.pflxDockApplyPreset('giant-mega-size');
  check('an unknown preset name is a silent no-op, not a crash or a size change',
    state.w === before.w && state.h === before.h);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
