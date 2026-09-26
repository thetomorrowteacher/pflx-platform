// PATCH PLATFORM v249 -- "The live theater should start in the notification
// and not open already" (Ennis). Extracts the REAL shipped apply()/
// renderChip()/pflxXBotAutoStartTheaterOnLogin functions from preview.html
// via brace-counting and runs them in a vm sandbox with mocked closure deps.
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

const applySrc = extractFn('function apply(st, skewSample) {');
const renderChipSrc = extractFn('function renderChip() {');
const loginAutoSrc = extractFn('var _v203Auto = window.pflxXBotAutoStartTheaterOnLogin;\n        window.pflxXBotAutoStartTheaterOnLogin = function () {');

// ---- string-level checks on the extracted source ----
// Note: apply()'s own explanatory comment mentions pflxTheaterLiveOpenPip(true)
// by name (documenting where the viewer's own click now goes), so the real
// check is that the old AUTO-CALL statement is gone, not that the name never
// appears anywhere in a comment.
ok('apply() no longer contains the old auto-open call statement', !/else if \(T\.dismissedFor !== st\.id\) window\.pflxTheaterLiveOpenPip\(false\)/.test(applySrc));
ok('apply() extracted contains the v249 removal comment', /should start[\s\S]{0,80}in the notification/.test(applySrc));
ok('renderChip() show condition now keys off !T.ownsPip, not dismissedFor', /!T\.ownsPip/.test(renderChipSrc) && !/T\.dismissedFor === st\.id/.test(renderChipSrc));
ok('login auto-start no longer calls pflxTheaterLiveOpenPip for a live broadcast', !/pflxTheaterLiveOpenPip/.test(loginAutoSrc));
ok('login auto-start still marks _pflxTheaterAutoStartDone when live', /_pflxTheaterAutoStartDone = true/.test(loginAutoSrc));
ok('login auto-start still falls back to the base (_v203Auto) when NOT live', /_v203Auto\(\);/.test(loginAutoSrc));

// ---- behavioral sandbox: apply() ----
function makeApplySandbox() {
  const calls = { closePip: 0, sync: 0, render: 0, renderChip: 0, openPip: 0, dockSetPlaying: [] };
  const T = { state: null, skew: 0, media: null, ownsPip: false, dismissedFor: null, localIndex: null, localFor: null };
  function viewer() { return { id: 'player-1', cohort: 'alpha' }; }
  function closePip() { calls.closePip++; T.ownsPip = false; }
  function sync() { calls.sync++; }
  function render() { calls.render++; }
  function renderChip() { calls.renderChip++; }
  const window = {
    pflxTheaterLiveInScope: function () { return true; },
    pflxTheaterLiveOpenPip: function () { calls.openPip++; },
    pflxDockSetTheaterPlaying: function (v) { calls.dockSetPlaying.push(v); },
    _xbotTheaterWatchingId: null
  };
  const sandbox = { T, viewer, closePip, sync, render, renderChip, window, console, isFinite, Math, calls };
  vm.createContext(sandbox);
  return sandbox;
}

(function () {
  const sandbox = makeApplySandbox();
  const applyFn = vm.runInContext('(function (st, skewSample) ' + applySrc.slice(applySrc.indexOf('{')) + ')', sandbox);
  // Session transitions from not-live to LIVE, viewer has never opened the PIP.
  applyFn({ id: 'sess-1', rev: 1, active: true, playlist: [{ title: 'Live now' }], index: 0 }, 0);
  ok('apply(): going live with ownsPip=false never calls openPip (no auto-open)', sandbox.calls.openPip === 0);
  ok('apply(): going live still calls renderChip() so the notification renders', sandbox.calls.renderChip === 1);
  ok('apply(): going live still calls render() (no active watch id)', sandbox.calls.render === 1);
  ok('apply(): dockSetTheaterPlaying(true) still fires on going live', sandbox.calls.dockSetPlaying[sandbox.calls.dockSetPlaying.length - 1] === true);

  // Now simulate the viewer having actually opened the PIP (ownsPip=true) and
  // a new revision of the SAME session arriving -- should sync(), not open.
  sandbox.T.ownsPip = true;
  applyFn({ id: 'sess-1', rev: 2, active: true, playlist: [{ title: 'Live now' }], index: 0 }, 0);
  ok('apply(): with PIP already open, a new revision calls sync() not openPip', sandbox.calls.sync === 1 && sandbox.calls.openPip === 0);
})();

// ---- behavioral sandbox: renderChip() ----
function makeChipSandbox(ownsPip) {
  const store = {};
  // PATCH PLATFORM v251 forward-compat -- renderChip() now also calls
  // chip.querySelector('em') to measure/scroll a long title; stub a
  // minimal <em> so that call is a safe no-op here (this test doesn't
  // exercise title-scroll behavior itself -- see test_v251_theater_chip_title_scroll.js for that).
  const emEl = { scrollWidth: 100, clientWidth: 100, classList: { add: function () {}, remove: function () {}, contains: function () { return false; } }, style: { setProperty: function () {} }, innerHTML: '' };
  const chipEl = { id: '', className: '', style: { display: '' }, innerHTML: '', onclick: null, querySelector: function (sel) { return sel === 'em' ? emEl : null; } };
  let appended = false;
  const document = {
    getElementById: function (id) { return (id === 'pflx-theater-live-chip' && appended) ? chipEl : null; },
    createElement: function () { return chipEl; },
    body: { appendChild: function () { appended = true; } }
  };
  const T = { state: null, ownsPip: !!ownsPip, dismissedFor: null };
  function viewer() { return { id: 'player-1' }; }
  const window = { pflxTheaterLiveInScope: function () { return true; }, pflxTheaterLiveOpenPip: function () {} };
  function esc(s) { return String(s); }
  const sandbox = { document, T, viewer, window, esc, console };
  vm.createContext(sandbox);
  return { sandbox, chipEl, get appended() { return appended; } };
}

(function () {
  const { sandbox, chipEl } = makeChipSandbox(false); // PIP not open
  const fn = vm.runInContext('(function () ' + renderChipSrc.slice(renderChipSrc.indexOf('{')) + ')', sandbox);
  sandbox.T.state = { id: 'sess-1', active: true, playlist: [{ title: 'Live now' }], index: 0 };
  fn();
  ok('renderChip(): live + PIP not open -> chip shown (default notification state)', chipEl.style.display === 'flex');
  ok('renderChip(): chip text includes LIVE THEATER / WATCH', /LIVE THEATER/.test(chipEl.innerHTML) && /WATCH/.test(chipEl.innerHTML));
})();

(function () {
  // Render once while the chip is shown (PIP closed) so a real chip element
  // exists in the DOM, then flip to PIP-open and re-render -- the existing
  // chip must actually be hidden, not just never-created.
  const { sandbox, chipEl } = makeChipSandbox(false);
  const fn = vm.runInContext('(function () ' + renderChipSrc.slice(renderChipSrc.indexOf('{')) + ')', sandbox);
  sandbox.T.state = { id: 'sess-1', active: true, playlist: [{ title: 'Live now' }], index: 0 };
  fn();
  ok('renderChip(): setup -- chip exists and is shown before opening the PIP', chipEl.style.display === 'flex');
  sandbox.T.ownsPip = true;
  fn();
  ok('renderChip(): live + PIP already open -> the existing chip is actually hidden (viewer is already watching)', chipEl.style.display === 'none');
})();

(function () {
  // dismissedFor no longer gates visibility at all -- a session that was
  // previously dismissed but the PIP is currently closed should STILL show
  // the chip (this is the actual bug being fixed: previously dismissedFor
  // was the ONLY path to a visible chip; now it's irrelevant to visibility).
  const { sandbox, chipEl } = makeChipSandbox(false);
  const fn = vm.runInContext('(function () ' + renderChipSrc.slice(renderChipSrc.indexOf('{')) + ')', sandbox);
  sandbox.T.state = { id: 'sess-1', active: true, playlist: [{ title: 'Live now' }], index: 0 };
  sandbox.T.dismissedFor = null; // never dismissed, PIP just never opened -- e.g. right after boot
  fn();
  ok('renderChip(): fresh live session, never dismissed, PIP closed -> chip STILL shows (this is the actual fix)', chipEl.style.display === 'flex');
})();

// ---- behavioral sandbox: login auto-start no longer force-opens ----
(function () {
  const calls = { openPip: 0, v203Auto: 0 };
  const window = {
    _pflxTheaterAutoStartDone: false,
    pflxTheaterLiveIsActive: function () { return true; }, // a broadcast IS live
    pflxTheaterLiveOpenPip: function () { calls.openPip++; }
  };
  const _readyP = Promise.resolve();
  function _v203Auto() { calls.v203Auto++; }
  const sandbox = { window, _readyP, _v203Auto, console, Promise, setTimeout, calls };
  vm.createContext(sandbox);
  const fnBody = loginAutoSrc.slice(loginAutoSrc.indexOf('{'));
  const fn = vm.runInContext('(function () ' + fnBody + ')', sandbox);
  const p = fn();
  setTimeout(function () {
    ok('login auto-start: live broadcast does NOT call openPip', sandbox.calls.openPip === 0);
    ok('login auto-start: live broadcast marks _pflxTheaterAutoStartDone', sandbox.window._pflxTheaterAutoStartDone === true);
    ok('login auto-start: live broadcast does NOT fall through to the playlist fallback', sandbox.calls.v203Auto === 0);
    finish();
  }, 50);
})();

function finish() {
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
