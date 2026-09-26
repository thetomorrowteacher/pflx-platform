// PATCH PLATFORM v248 -- X-Bot dock visual/behavior fixes (Ennis's annotated
// screenshot request). Extracts the REAL shipped code from preview.html via
// brace-counting (never a reimplementation) and runs it in a vm sandbox.
//
// Covers:
//  1) X-Gems load(force) no longer restores a persisted persona from
//     localStorage on a fresh load (Ennis: "always restart in normal mode").
//  2) X-Gems select(id) still persists a mid-session pick exactly as before
//     (regression check -- this function was NOT modified by v248).
//  3) Spot-checks: PFLX_PATCH bumped to 248; #pflx-dock glow strengthened;
//     .xbot-msg-bubble max-width now scales instead of a flat 280px.
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

// ---- 1/2: extract the real load() and select() bodies ----
const loadSrc = extractFn('function load(force) {');
const selectSrc = extractFn('function select(id) {');

ok('load() extracted contains the v248 removal comment', /always restart in normal mode/.test(loadSrc));
ok('load() extracted no longer reads ACTIVE_LS at all', !/localStorage\.getItem\(ACTIVE_LS\)/.test(loadSrc));
ok('select() extracted still writes/removes ACTIVE_LS (unchanged)', /localStorage\.setItem\(ACTIVE_LS/.test(selectSrc) && /localStorage\.removeItem\(ACTIVE_LS\)/.test(selectSrc));

// ---- Behavioral sandbox: run the real load()/select() against a fake DOM/localStorage ----
function makeSandbox(lsStore) {
  const localStorage = {
    _s: lsStore || {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; }
  };
  const ACTIVE_LS = 'pflx_xgem_active_v1';
  const LIST_KEY = 'pflx_xgems';
  const GEM = { id: 'gem-1', name: 'Test Gem', enabled: true, allCohorts: true };
  const S = { list: [GEM], content: {}, active: null, hist: {}, loaded: false, reply: null, feed: null, header: null };
  let renderAllCalls = 0;
  let contentCalls = [];
  function renderAll() { renderAllCalls++; }
  function content(id) { contentCalls.push(id); }
  function byId(id) { return (S.list || []).find(function (g) { return g && g.id === id; }) || null; }
  function canUse(g) { return !!g; }
  function readRow(k) {
    // Simulate a real cloud read returning the list row.
    return Promise.resolve({ items: S.list });
  }
  const sandbox = {
    S, ACTIVE_LS, LIST_KEY, localStorage, byId, canUse, readRow, renderAll, content,
    console, Promise,
    __getState: function () { return { S, renderAllCalls: renderAllCalls, contentCalls: contentCalls, ls: localStorage._s }; }
  };
  vm.createContext(sandbox);
  return sandbox;
}

// Test A: load() with a stale ACTIVE_LS pointing at a valid, usable gem --
// the OLD code would have restored S.active = 'gem-1'; the NEW code must not.
(function () {
  const sandbox = makeSandbox({ pflx_xgem_active_v1: 'gem-1' });
  const fnWrapper = vm.runInContext('(function (force) ' + loadSrc.slice(loadSrc.indexOf('{')) + ')', sandbox);
  const p = fnWrapper(false);
  return p.then(function () {
    const st = sandbox.__getState();
    ok('load(): fresh load with a stale ACTIVE_LS does NOT restore S.active', st.S.active === null);
    ok('load(): S.list still populated from the real cloud read', st.S.list.length === 1 && st.S.list[0].id === 'gem-1');
    ok('load(): S.loaded set true', st.S.loaded === true);
    ok('load(): renderAll() still called exactly once', st.renderAllCalls === 1);
    ok('load(): localStorage itself left untouched (not cleared, not read)', st.ls.pflx_xgem_active_v1 === 'gem-1');
    return runB();
  });
})().catch(function (e) { console.log('FAIL - load() test threw: ' + e.message); fail++; runB(); });

function runB() {
  // Test B: select() regression -- picking a gem mid-session still persists
  // to localStorage and sets S.active, exactly as before v248 (unchanged fn).
  const sandbox = makeSandbox({});
  const selectFn = vm.runInContext('(function (id) ' + selectSrc.slice(selectSrc.indexOf('{')) + ')', sandbox);
  selectFn('gem-1');
  let st = sandbox.__getState();
  ok('select(): picking a valid usable gem sets S.active', st.S.active === 'gem-1');
  ok('select(): picking a valid gem persists to localStorage', st.ls.pflx_xgem_active_v1 === 'gem-1');
  ok('select(): content() called for the newly active gem', st.contentCalls.indexOf('gem-1') !== -1);
  ok('select(): renderAll() called', st.renderAllCalls === 1);

  selectFn(null);
  st = sandbox.__getState();
  ok('select(null): clears S.active', st.S.active === null);
  ok('select(null): removes the localStorage key', !Object.prototype.hasOwnProperty.call(st.ls, 'pflx_xgem_active_v1'));

  selectFn('nonexistent-id');
  st = sandbox.__getState();
  ok('select(): an unknown id resolves to null (fails closed)', st.S.active === null);

  runSpotChecks();
}

function runSpotChecks() {
  // ---- 3: CSS / version spot-checks (string presence against the real file) ----
  ok('PFLX_PATCH bumped to 248', /window\.PFLX_PATCH\s*=\s*248;/.test(src));
  ok('PFLX_VERSION left unchanged at 1.0.0 (no milestone this patch)', /window\.PFLX_VERSION\s*=\s*'1\.0\.0';/.test(src));
  ok('#pflx-dock border opacity increased to 55%', /var\(--cyan, #00f0ff\) 55%, transparent\); border-radius:14px;/.test(src));
  ok('#pflx-dock has the new dual-layer glow (90px outer)', /0 0 90px color-mix\(in srgb, var\(--cyan, #00f0ff\) 30%, transparent\)/.test(src));
  ok('#pflx-dock has the new dual-layer glow (34px inner)', /0 0 34px color-mix\(in srgb, var\(--cyan, #00f0ff\) 45%, transparent\)/.test(src));
  ok('#pflx-dock old single-layer 46px glow is gone', !/0 0 46px color-mix\(in srgb, var\(--cyan, #00f0ff\) 14%, transparent\)/.test(src));
  ok('.xbot-msg-bubble max-width now scales (min(78%, 640px))', /max-width:\s*min\(78%,\s*640px\);/.test(src));
  var bubbleBlockMatch = /\.xbot-msg-bubble \{[\s\S]*?\}/.exec(src);
  var bubbleBlock = bubbleBlockMatch ? bubbleBlockMatch[0] : '';
  ok('.xbot-msg-bubble block found for scoped check', !!bubbleBlockMatch);
  ok('.xbot-msg-bubble old flat 280px cap is gone (scoped to its own rule)', !/max-width:\s*280px;/.test(bubbleBlock));

  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}
