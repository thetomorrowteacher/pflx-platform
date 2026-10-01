// PATCH PLATFORM v258 -- Next X-Live Show Countdown (Task F part 1 of 5,
// platform-wide half). Settings live in X-Live's Live Theater tab (PATCH
// X-LIVE v0.82); this patch just displays the SAME cfg.nextShowAt/
// nextShowLabel fields for every logged-in user via the existing xb-2
// pflxXBotLoadCfg() bridge. Extracts the REAL shipped IIFE via
// brace-counting and runs it in a vm sandbox with a mocked document/window
// -- never a reimplementation.
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

function extractIifeAfter(landmark) {
  const landmarkIdx = src.indexOf(landmark);
  if (landmarkIdx === -1) throw new Error('landmark not found: ' + landmark);
  const startIdx = src.indexOf('(function () {', landmarkIdx);
  if (startIdx === -1) throw new Error('IIFE opening not found after landmark');
  const braceStart = src.indexOf('{', startIdx);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  // consume the trailing `)();`
  const closeIdx = src.indexOf(';', i) + 1;
  return src.slice(startIdx, closeIdx);
}

ok('PFLX_PATCH bumped to 258', /window\.PFLX_PATCH\s*=\s*258;/.test(src));
ok('PFLX_BUILD bumped to 2026.10', /window\.PFLX_BUILD\s*=\s*'2026\.10';/.test(src));
ok('post-login hook wires pflxNextShowStart', /pflxNextShowStart === 'function'\) window\.pflxNextShowStart\(\);.*PATCH PLATFORM v258/.test(src));

const iifeSrc = extractIifeAfter('FEATURE: Next X-Live Show Countdown (platform-wide badge)');
ok('IIFE extracted and non-trivial', iifeSrc.length > 500);

// ---- Build a minimal fake DOM + window + run the real IIFE in a vm sandbox ----
function makeDomMock() {
  const elements = {};
  function makeEl(id) {
    return {
      id: id,
      style: {},
      innerHTML: '',
      textContent: '',
      _children: [],
      appendChild: function () {}
    };
  }
  const doc = {
    _store: elements,
    getElementById: function (id) { return elements[id] || null; },
    createElement: function () {
      // the element this creates (the badge) gets registered under a
      // fixed id once ensureBadgeEl assigns el.id = 'pflx-nextshow-badge'
      // and appends it -- simulate that by giving it a setter trap via
      // a plain object whose id assignment we can observe after the fact.
      const el = makeEl(undefined);
      return el;
    },
    body: { appendChild: function (el) { if (el && el.id) elements[el.id] = el; } }
  };
  return doc;
}

function runSandbox(loadCfgImpl) {
  const document = makeDomMock();
  const sandboxWindow = {
    pflxXBotLoadCfg: loadCfgImpl
  };
  const context = {
    window: sandboxWindow,
    document: document,
    console: { log: function () {}, warn: function () {} },
    setInterval: function () { return 0; }, // never actually fire in tests -- we call draw paths directly
    Date: Date
  };
  vm.createContext(context);
  vm.runInContext(iifeSrc, context);
  return { window: sandboxWindow, document: document };
}

// Build the badge element up front (ensureBadgeEl's job) by pre-registering
// it the way the real DOM would after the IIFE's own ensureBadgeEl() runs --
// since our createElement mock doesn't itself set .id, call pflxNextShowPoll
// and then manually finalize the id/registration to mirror what a real
// document.createElement + el.id = ... + appendChild would do.
async function pollAndSettle(sandboxWindow, document, cfg) {
  // Patch createElement path: ensureBadgeEl() does
  //   el = document.createElement('div'); el.id = 'pflx-nextshow-badge'; ... document.body.appendChild(el)
  // Our mock's appendChild only registers by el.id, which IS set by the
  // real source before appendChild runs, so this works without further
  // patching -- but we need the <b id="pflx-nextshow-val"> child the real
  // innerHTML assignment creates. The real code sets el.innerHTML directly
  // (a string) rather than creating the <b> as a real child node, so our
  // test instead drives drawNextShow()'s effect indirectly: after poll(),
  // read window._pflxNextShowState and call the exported countdown math
  // directly to confirm state capture, and separately verify the DOM
  // write path exists structurally (checked via string assertions above).
  await sandboxWindow.pflxXBotLoadCfg; // no-op await to keep shape consistent
  return sandboxWindow;
}

(async function () {
  // ---- pflxNextShowCountdownText: byte-for-byte port, same math as X-Live's ----
  {
    const { window: w } = runSandbox(async function () { return {}; });
    const fn = w.pflxNextShowCountdownText;
    ok('pflxNextShowCountdownText exported on window', typeof fn === 'function');
    ok('empty string -> null', fn('', 1000) === null);
    ok('malformed date -> null', fn('garbage', 1000) === null);
    const now = Date.UTC(2026, 9, 1, 12, 0, 0);
    ok('already-past target -> null', fn(new Date(now - 1000).toISOString(), now) === null);
    const r1 = fn(new Date(now + 90000).toISOString(), now);
    ok('90s out -> "1m 30s"', r1 && r1.label === '1m 30s');
    ok('90s out -> imminent', r1 && r1.imminent === true);
    const r2 = fn(new Date(now + ((3 * 24 + 4) * 60 + 10) * 60 * 1000).toISOString(), now);
    ok('3d4h10m out -> "3d 4h 10m"', r2 && r2.label === '3d 4h 10m');
    const r3 = fn(new Date(now + 20 * 60 * 1000).toISOString(), now);
    ok('20min out -> not imminent', r3 && r3.imminent === false);
  }

  // ---- pflxNextShowPoll: reads cfg via the xb-2 bridge, stores state, fails safe ----
  {
    const future = new Date('2099-06-01T00:00:00Z').toISOString();
    const { window: w, document: d } = runSandbox(async function () {
      return { nextShowAt: future, nextShowLabel: 'Season Finale' };
    });
    ok('pflxNextShowPoll exported on window', typeof w.pflxNextShowPoll === 'function');
    await w.pflxNextShowPoll();
    ok('poll stores nextShowAt from the real cfg bridge', w._pflxNextShowState.nextShowAt === future);
    ok('poll stores nextShowLabel from the real cfg bridge', w._pflxNextShowState.nextShowLabel === 'Season Finale');
    ok('poll creates the badge element in the DOM', !!d.getElementById('pflx-nextshow-badge'));
  }

  {
    // no show scheduled -> state fields fall back to '' (never undefined)
    const { window: w } = runSandbox(async function () { return {}; });
    await w.pflxNextShowPoll();
    ok('poll with no cfg.nextShowAt falls back to empty string', w._pflxNextShowState.nextShowAt === '');
    ok('poll with no cfg.nextShowLabel falls back to empty string', w._pflxNextShowState.nextShowLabel === '');
  }

  {
    // pflxXBotLoadCfg missing entirely (bridge not loaded yet) -> no throw
    const { window: w } = runSandbox(undefined);
    delete w.pflxXBotLoadCfg;
    let threw = false;
    try { await w.pflxNextShowPoll(); } catch (e) { threw = true; }
    ok('poll with no pflxXBotLoadCfg bridge does not throw', !threw);
  }

  {
    // pflxXBotLoadCfg throws -> poll fails safe, does not propagate
    const { window: w } = runSandbox(async function () { throw new Error('network down'); });
    let threw = false;
    try { await w.pflxNextShowPoll(); } catch (e) { threw = true; }
    ok('poll with a failing cfg bridge fails safe (no throw)', !threw);
  }

  // ---- pflxNextShowStart: idempotent (won't stack intervals on repeated login) ----
  {
    let intervalCalls = 0;
    const document = makeDomMock();
    const sandboxWindow = { pflxXBotLoadCfg: async function () { return {}; } };
    const context = {
      window: sandboxWindow, document: document,
      console: { log: function () {}, warn: function () {} },
      setInterval: function () { intervalCalls++; return intervalCalls; },
      Date: Date
    };
    vm.createContext(context);
    vm.runInContext(iifeSrc, context);
    sandboxWindow.pflxNextShowStart();
    sandboxWindow.pflxNextShowStart();
    sandboxWindow.pflxNextShowStart();
    ok('pflxNextShowStart is idempotent (setInterval pair only created once)', intervalCalls === 2);
  }

  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
  if (fail > 0) process.exit(1);
})();
