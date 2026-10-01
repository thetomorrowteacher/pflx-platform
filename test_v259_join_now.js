// Unit tests for PATCH PLATFORM v259 -- "Join X-Live Now" popup.
// Extracts the REAL shipped IIFE from preview.html (brace-counted from the
// patch's own landmark comment) and runs it in a sandboxed vm context with
// mocked window/document/sessionStorage/fetch-equivalents -- never a
// reimplementation of the real code.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'preview.html'), 'utf8');

const landmark = 'FEATURE: "Join X-Live Now" popup (Task F part 2 of 5, Oct 1)';
const landmarkIdx = src.indexOf(landmark);
if (landmarkIdx === -1) throw new Error('landmark comment not found');

// Find the start of the IIFE: the next "(function () {" after the landmark's
// comment block closes.
const iifeStart = src.indexOf('(function () {', landmarkIdx);
if (iifeStart === -1) throw new Error('IIFE start not found');

// Brace-count from the first '{' after iifeStart to its matching close,
// then confirm the trailing '})();'.
let i = src.indexOf('{', iifeStart);
let depth = 0, end = -1;
for (; i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
if (end === -1) throw new Error('matching close brace not found');
// consume the trailing ()
let tail = src.slice(end + 1, end + 10);
if (!/^\s*\)\(\)\s*;/.test(tail)) throw new Error('unexpected trailing text after IIFE close: ' + JSON.stringify(tail));
const closeParenIdx = src.indexOf(';', end) + 1;

const iifeCode = src.slice(iifeStart, closeParenIdx);

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name); }
}

function makeSandbox() {
  const sessionStore = {};
  const windowObj = {
    console,
    pflxXBotLoadSessions: null,
    activeSession: null,
    pflxRole: null,
    pflxPipOpen: null,
    pflxPipApplyPreset: null,
  };
  const documentObj = {
    _elements: {},
    getElementById: function (id) {
      return documentObj._elements[id] || null;
    },
    createElement: function (tag) {
      return { id: '', style: {}, innerHTML: '', dataset: {}, appendChild: function () {} };
    },
    body: { appendChild: function (el) { documentObj._elements[el.id] = el; } },
  };
  const sandbox = {
    window: windowObj,
    document: documentObj,
    sessionStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(sessionStore, k) ? sessionStore[k] : null; },
      setItem: function (k, v) { sessionStore[k] = String(v); },
    },
    buildAppURL: function (key) { return 'https://thetomorrowteacher.github.io/x-live'; },
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(iifeCode, sandbox);
  return sandbox;
}

async function main() {
  // ── pflxJoinNowCohortsOf ──
  {
    const sb = makeSandbox();
    check('cohortsOf: comma-split + lowercased', JSON.stringify(sb.window.pflxJoinNowCohortsOf({ cohort: 'Block A, Block B' })) === JSON.stringify(['block a', 'block b']));
    check('cohortsOf: cohorts array merged with cohort string, deduped', JSON.stringify(sb.window.pflxJoinNowCohortsOf({ cohort: 'Block A', cohorts: ['block a', 'Block C'] })) === JSON.stringify(['block a', 'block c']));
    check('cohortsOf: null entry -> []', JSON.stringify(sb.window.pflxJoinNowCohortsOf(null)) === '[]');
    check('cohortsOf: empty entry -> []', JSON.stringify(sb.window.pflxJoinNowCohortsOf({})) === '[]');
    check('cohortsOf: semicolon split also works', JSON.stringify(sb.window.pflxJoinNowCohortsOf({ cohort: 'A; B' })) === JSON.stringify(['a', 'b']));
  }

  // ── pflxJoinNowSessionApplies ──
  {
    const sb = makeSandbox();
    const applies = sb.window.pflxJoinNowSessionApplies;
    check('applies: inactive session -> false', applies({ status: 'ended', cohorts: ['a'] }, ['a']) === false);
    check('applies: allCohorts true -> true regardless', applies({ status: 'active', allCohorts: true, cohorts: ['z'] }, ['a']) === true);
    check('applies: no cohorts field -> applies to everyone', applies({ status: 'active' }, ['a']) === true);
    check('applies: empty cohorts array -> applies to everyone', applies({ status: 'active', cohorts: [] }, ['a']) === true);
    check('applies: matching cohort -> true', applies({ status: 'active', cohorts: ['Block A', 'Block B'] }, ['block a']) === true);
    check('applies: non-matching cohort -> false', applies({ status: 'active', cohorts: ['Block B'] }, ['block a']) === false);
    check('applies: case-insensitive match', applies({ status: 'active', cohorts: ['BLOCK A'] }, ['block a']) === true);
  }

  // ── pflxJoinNowPick ──
  {
    const sb = makeSandbox();
    const pick = sb.window.pflxJoinNowPick;
    check('pick: null sessions -> null', pick(null, ['a'], 'me') === null);
    check('pick: null mine -> null', pick([{ status: 'active', cohorts: [] }], null, 'me') === null);
    check('pick: no in-scope sessions -> null', pick([{ status: 'active', cohorts: ['x'] }], ['a'], 'me') === null);
    check('pick: already-joined session excluded', pick([{ id: 's1', status: 'active', cohorts: [], liveParticipants: [{ id: 'me' }] }], ['a'], 'me') === null);
    const picked = pick([
      { id: 's1', status: 'active', cohorts: [], liveParticipants: [], liveStartedAt: 100 },
      { id: 's2', status: 'active', cohorts: [], liveParticipants: [], liveStartedAt: 500 },
    ], ['a'], 'me');
    check('pick: picks the most-recently-started matching session', picked && picked.id === 's2');
    check('pick: a player ALREADY in liveParticipants on one session, not the other, still offers the other', pick([
      { id: 's1', status: 'active', cohorts: [], liveParticipants: [{ id: 'me' }] },
      { id: 's2', status: 'active', cohorts: [], liveParticipants: [] },
    ], ['a'], 'me').id === 's2');
  }

  // ── pflxJoinNowGo / Dismiss (DOM side effects) ──
  {
    const sb = makeSandbox();
    // Set up the pip-xlive frame + title elements the real DOM has.
    const frame = { id: 'pip-xlive-frame', src: 'about:blank', dataset: {} };
    const titleEl = { id: 'pip-xlive-title', textContent: '' };
    sb.document._elements['pip-xlive-frame'] = frame;
    sb.document._elements['pip-xlive-title'] = titleEl;
    sb.document._elements['pflx-joinnow-title'] = { id: 'pflx-joinnow-title', textContent: '' };
    let pipOpenedWith = null, presetAppliedWith = null;
    sb.window.pflxPipOpen = function (id) { pipOpenedWith = id; };
    sb.window.pflxPipApplyPreset = function (id, preset) { presetAppliedWith = [id, preset]; };

    // Trigger a check that finds a match, populating _jnCurrent + showing modal.
    sb.window.activeSession = { id: 'me', role: 'player', cohort: 'Block A' };
    sb.window.pflxRole = null;
    sb.window.pflxXBotLoadSessions = async function () {
      return [{ id: 'sessX', title: 'Friday Showcase', status: 'active', cohorts: ['block a'], liveParticipants: [], liveStartedAt: 1 }];
    };
    await sb.window.pflxJoinNowCheck();
    const modalEl = sb.document._elements['pflx-joinnow-modal'];
    check('check(): creates + shows the modal on a real match', !!modalEl && modalEl.style.display === 'flex');
    const titleHolder = sb.document._elements['pflx-joinnow-title'];
    check('check(): modal title set to the session title', titleHolder && titleHolder.textContent === 'Friday Showcase');

    sb.window.pflxJoinNowGo();
    check('Go: builds the pip-xlive deep link with pip=1 and the right session id', frame.src === 'https://thetomorrowteacher.github.io/x-live?pip=1&session=sessX');
    check('Go: stamps frame.dataset.session', frame.dataset.session === 'sessX');
    check('Go: sets the pip title', titleEl.textContent === '🔴 FRIDAY SHOWCASE');
    check('Go: opens the real pip-xlive PIP', pipOpenedWith === 'pip-xlive');
    check('Go: applies the large preset', presetAppliedWith && presetAppliedWith[0] === 'pip-xlive' && presetAppliedWith[1] === 'large');
    check('Go: hides the modal after opening', modalEl.style.display === 'none');
  }

  // ── Dismiss persists per-session via sessionStorage, suppressing re-check ──
  {
    const sb = makeSandbox();
    sb.document._elements['pip-xlive-frame'] = { id: 'pip-xlive-frame', src: 'about:blank', dataset: {} };
    sb.window.activeSession = { id: 'me', role: 'player', cohort: 'Block A' };
    sb.window.pflxRole = null;
    sb.window.pflxXBotLoadSessions = async function () {
      return [{ id: 'sessY', title: 'Pop Quiz Live', status: 'active', cohorts: ['block a'], liveParticipants: [], liveStartedAt: 1 }];
    };
    await sb.window.pflxJoinNowCheck();
    sb.window.pflxJoinNowDismiss();
    const modalEl = sb.document._elements['pflx-joinnow-modal'];
    check('Dismiss: hides the modal', modalEl.style.display === 'none');
    check('Dismiss: marks sessionStorage dismissed', sb.sessionStorage.getItem('pflx_joinnow_dismissed_sessY') === '1');

    // A second check for the SAME session must not re-show it.
    await sb.window.pflxJoinNowCheck();
    check('check(): does not re-show a dismissed session', modalEl.style.display === 'none');
  }

  // ── Host-gating ──
  {
    const sb = makeSandbox();
    sb.document._elements['pip-xlive-frame'] = { id: 'pip-xlive-frame', src: 'about:blank', dataset: {} };
    sb.window.activeSession = { id: 'hostMe', role: 'host', cohort: 'Block A' };
    sb.window.pflxRole = null; // real host, NOT previewing as player
    let loadCalled = false;
    sb.window.pflxXBotLoadSessions = async function () { loadCalled = true; return []; };
    await sb.window.pflxJoinNowCheck();
    check('check(): a real host (not previewing) never even loads sessions', loadCalled === false);
  }
  {
    const sb = makeSandbox();
    sb.document._elements['pip-xlive-frame'] = { id: 'pip-xlive-frame', src: 'about:blank', dataset: {} };
    sb.window.activeSession = { id: 'hostMe', role: 'host', cohort: 'Block A' };
    sb.window.pflxRole = 'player'; // previewing as player
    sb.window.pflxXBotLoadSessions = async function () {
      return [{ id: 'sessZ', title: 'Host Preview Session', status: 'active', cohorts: ['block a'], liveParticipants: [], liveStartedAt: 1 }];
    };
    await sb.window.pflxJoinNowCheck();
    const modalEl = sb.document._elements['pflx-joinnow-modal'];
    check('check(): a host PREVIEWING as player still sees the popup', !!modalEl && modalEl.style.display === 'flex');
  }

  // ── Fail-safe paths ──
  {
    const sb = makeSandbox();
    sb.window.pflxXBotLoadSessions = undefined;
    sb.window.activeSession = { id: 'me', role: 'player', cohort: 'A' };
    let threw = false;
    try { await sb.window.pflxJoinNowCheck(); } catch (e) { threw = true; }
    check('check(): missing bridge never throws', threw === false);
  }
  {
    const sb = makeSandbox();
    sb.window.activeSession = null;
    let threw = false;
    try { await sb.window.pflxJoinNowCheck(); } catch (e) { threw = true; }
    check('check(): no activeSession never throws', threw === false);
  }
  {
    const sb = makeSandbox();
    sb.window.activeSession = { id: 'me', role: 'player', cohort: '' };
    sb.window.pflxXBotLoadSessions = async function () { return []; };
    let threw = false;
    try { await sb.window.pflxJoinNowCheck(); } catch (e) { threw = true; }
    check('check(): no cohort -> no throw, no popup', threw === false && !sb.document._elements['pflx-joinnow-modal']);
  }
  {
    const sb = makeSandbox();
    sb.window.activeSession = { id: 'me', role: 'player', cohort: 'A' };
    sb.window.pflxXBotLoadSessions = async function () { throw new Error('network down'); };
    let threw = false;
    try { await sb.window.pflxJoinNowCheck(); } catch (e) { threw = true; }
    check('check(): a failed cloud load never throws', threw === false);
  }
  {
    // Go() with no current session picked (e.g. called stray) is a safe no-op.
    const sb = makeSandbox();
    let threw = false;
    try { sb.window.pflxJoinNowGo(); } catch (e) { threw = true; }
    check('Go(): safe no-op with no _jnCurrent', threw === false);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main();
