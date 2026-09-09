// Unit tests for the Console's Mission Control embed auto-login relay
// receiver (Sept 9, Ennis: "I shouldn't have to login").
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

function extractFunction(src, marker) {
  const start = src.indexOf(marker);
  if (start === -1) throw new Error('not found: ' + marker);
  const braceStart = src.indexOf('{', start);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}
function extractBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
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

// ── 1. pflxTryEmbedIdentityLogin ────────────────────────────────────────
function makeLoginSandbox() {
  const sandbox = {};
  const fnSrc = extractFunction(src, 'function pflxTryEmbedIdentityLogin(');
  const timers = []; // captured setTimeout calls: {fn, delay}
  sandbox.window = {};
  sandbox.console = console;
  sandbox.setTimeout = function (fn, delay) { timers.push({ fn: fn, delay: delay }); return timers.length; };
  sandbox.calls = { findPlayerByBrand: [], loginUser: [], navigateTo: [] };
  sandbox.findPlayerByBrand = function (b) { sandbox.calls.findPlayerByBrand.push(b); return sandbox.__playerToReturn; };
  sandbox.loginUser = function (b) { sandbox.calls.loginUser.push(b); };
  sandbox.navigateTo = function (v) { sandbox.calls.navigateTo.push(v); };
  new Function('sandbox', 'with (sandbox) {\n' + fnSrc + '\nsandbox.pflxTryEmbedIdentityLogin = pflxTryEmbedIdentityLogin;\n}')(sandbox);
  sandbox.__timers = timers;
  return sandbox;
}

(function () {
  const sb = makeLoginSandbox();
  sb.window.activeSession = { brand: 'ALREADY LOGGED IN' };
  sb.pflxTryEmbedIdentityLogin('SOMEBRAND', 2);
  check('already-logged-in session -> never even looks up the brand (no clobber)', sb.calls.findPlayerByBrand.length === 0 && sb.calls.loginUser.length === 0);
})();

(function () {
  const sb = makeLoginSandbox();
  sb.window.activeSession = null;
  sb.pflxTryEmbedIdentityLogin('', 2);
  check('empty brand -> no-op', sb.calls.findPlayerByBrand.length === 0);
})();

(function () {
  const sb = makeLoginSandbox();
  sb.window.activeSession = null;
  sb.__playerToReturn = { id: 'p1', brand: 'ROCKETQUEEN' };
  sb.pflxTryEmbedIdentityLogin('rocketqueen', 2);
  check('player found -> loginUser called with the CANONICAL roster brand', sb.calls.loginUser.length === 1 && sb.calls.loginUser[0] === 'ROCKETQUEEN');
  check('a navigateTo(\'mission-control\') is scheduled after login', sb.__timers.length === 1);
  sb.__timers[0].fn();
  check('scheduled callback actually calls navigateTo(\'mission-control\')', sb.calls.navigateTo.length === 1 && sb.calls.navigateTo[0] === 'mission-control');
})();

(function () {
  const sb = makeLoginSandbox();
  sb.window.activeSession = null;
  sb.__playerToReturn = null; // roster not loaded yet
  sb.pflxTryEmbedIdentityLogin('SLOWROSTER', 2);
  check('player not found, attempts remain -> schedules a retry, does not log in', sb.calls.loginUser.length === 0 && sb.__timers.length === 1);
  // run the retry
  sb.__playerToReturn = { id: 'p2', brand: 'SLOWROSTER' };
  sb.__timers[0].fn();
  check('retry succeeds once roster is available', sb.calls.loginUser.length === 1 && sb.calls.loginUser[0] === 'SLOWROSTER');
})();

(function () {
  const sb = makeLoginSandbox();
  sb.window.activeSession = null;
  sb.__playerToReturn = null;
  sb.pflxTryEmbedIdentityLogin('NEVERFOUND', 0);
  check('player not found, no attempts left -> gives up, no retry scheduled, no login (fails closed)', sb.calls.loginUser.length === 0 && sb.__timers.length === 0);
})();

// ── 2. Message listener -- origin allowlist + embedded-only gate ────────
// This block (deliberately) also contains the REAL pflxTryEmbedIdentityLogin
// function declaration -- a `function` statement inside `with(sandbox){}`
// hoists into the enclosing scope same as `var` does, so it shadows any
// sandbox.pflxTryEmbedIdentityLogin stub. Rather than fight that, these
// tests run the real end-to-end wiring (listener -> real
// pflxTryEmbedIdentityLogin -> loginUser) and assert on loginUser calls --
// stronger coverage than mocking the relay function away.
function makeListenerSandbox() {
  const sandbox = {};
  const block = extractBetween(src,
    'var PFLX_TRUSTED_EMBED_ORIGINS',
    "                if (msg.type === 'pflx_xlive_embed_identity' && window.self !== window.top && PFLX_TRUSTED_EMBED_ORIGINS.indexOf(ev.origin) !== -1) {\n                    pflxTryEmbedIdentityLogin(msg.brand, 2);\n                }\n            } catch (e) {}\n        });\n"
  );
  const wired = block
    .replace("window.addEventListener('message', function (ev) {", 'sandbox.__listener = function (ev) {')
    .replace(/\n        \}\);\n$/, '\n        };\n');
  sandbox.window = {};
  sandbox.calls = { findPlayerByBrand: [], loginUser: [] };
  sandbox.findPlayerByBrand = function (b) { sandbox.calls.findPlayerByBrand.push(b); return { id: 'p1', brand: b.toUpperCase() }; };
  sandbox.loginUser = function (b) { sandbox.calls.loginUser.push(b); };
  sandbox.setTimeout = function () {}; // don't chase the post-login navigateTo timer here
  // stub the rest of the real listener's other branches so this extract runs standalone
  sandbox.window.pflxBroadcastXC = function () {};
  sandbox.document = { querySelectorAll: function () { return []; } };
  sandbox.broadcastIdentityToFrame = function () {};
  new Function('sandbox', 'with (sandbox) {\n' + wired + '\n}')(sandbox);
  return sandbox;
}

(function () {
  const sb = makeListenerSandbox();
  sb.window.top = sb.window; // not embedded: self === top
  sb.window.self = sb.window;
  sb.__listener({ origin: 'https://thetomorrowteacher.github.io', data: JSON.stringify({ type: 'pflx_xlive_embed_identity', brand: 'X' }) });
  check('not embedded (top-level visit) -> relay ignored even from the trusted origin', sb.calls.findPlayerByBrand.length === 0);
})();

(function () {
  const sb = makeListenerSandbox();
  sb.window.top = {}; // embedded: self !== top
  sb.window.self = sb.window;
  sb.__listener({ origin: 'https://evil-clone.example.com', data: JSON.stringify({ type: 'pflx_xlive_embed_identity', brand: 'X' }) });
  check('embedded but UNTRUSTED origin -> relay refused', sb.calls.findPlayerByBrand.length === 0);
})();

(function () {
  const sb = makeListenerSandbox();
  sb.window.top = {};
  sb.window.self = sb.window;
  sb.__listener({ origin: 'https://thetomorrowteacher.github.io', data: JSON.stringify({ type: 'pflx_xlive_embed_identity', brand: 'rocketqueen' }) });
  check('embedded + trusted X-Live origin -> reaches loginUser with the right brand', sb.calls.loginUser.length === 1 && sb.calls.loginUser[0] === 'ROCKETQUEEN');
})();

(function () {
  const sb = makeListenerSandbox();
  sb.window.top = {};
  sb.window.self = sb.window;
  sb.__listener({ origin: 'https://thetomorrowteacher.github.io', data: JSON.stringify({ type: 'some_other_message' }) });
  check('unrelated message type -> no relay call', sb.calls.findPlayerByBrand.length === 0);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
