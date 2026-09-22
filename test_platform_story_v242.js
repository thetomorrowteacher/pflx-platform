// PATCH PLATFORM v242 -- Story Mode: removed from Homebase/toolbar,
// pflxTryEmbedIdentityLogin generalized to accept a targetView. Extracts
// the real shipped source (never a reimplementation) and asserts against it.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'preview.html'), 'utf-8');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}

// ---- 1. Static structure checks against the real file text ----
ok('Homebase apps array no longer lists Story Mode',
  !/key:\s*'story',\s*name:\s*'Story Mode'/.test(src));
ok('Toolbar no longer has a data-view="story" nav button',
  !src.includes('data-view="story" title="Story Mode"'));
ok('story view route map entry is still intact (Story Mode still navigable internally)',
  /'story':\s*'story-view'/.test(src));
ok('pflxStoryBoot() boot hook is still intact',
  src.includes("if (typeof window.pflxStoryBoot === 'function') window.pflxStoryBoot();"));
ok('window.pflxStoryBoot itself is still defined (Story Mode module untouched)',
  src.includes('window.pflxStoryBoot = function'));

// ---- 2. Extract the real pflxTryEmbedIdentityLogin function body ----
function extractFn(source, startMarker) {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error('start marker not found: ' + startMarker);
  let i = source.indexOf('{', start);
  let depth = 0, end = -1;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end === -1) throw new Error('unbalanced braces for ' + startMarker);
  return source.slice(start, end);
}

const fnSrc = extractFn(src, 'function pflxTryEmbedIdentityLogin(brand, attemptsLeft, targetView)');
ok('extracted pflxTryEmbedIdentityLogin accepts a third targetView param', fnSrc.includes('targetView) {'));
ok('extracted fn defaults targetView to mission-control', fnSrc.includes("targetView = targetView || 'mission-control';"));
ok('extracted fn calls navigateTo(targetView), not a hardcoded string', fnSrc.includes('navigateTo(targetView)'));
ok('extracted fn passes targetView through on retry', fnSrc.includes('attemptsLeft - 1, targetView)'));

// ---- 3. Sandbox-execute the extracted function against realistic inputs ----
function runSandbox(fnSrc, opts) {
  const calls = { logins: [], navigations: [], retries: [] };
  const sandboxTimers = [];
  const sandbox = {
    window: { activeSession: opts.activeSession || null },
    findPlayerByBrand: opts.findPlayerByBrand || function (b) { return null; },
    loginUser: function (brand) { calls.logins.push(brand); },
    navigateTo: function (view) { calls.navigations.push(view); },
    setTimeout: function (fn, ms) { sandboxTimers.push(fn); }, // capture, run manually
    console: { warn: function () {} }
  };
  const fn = new Function('window', 'findPlayerByBrand', 'loginUser', 'navigateTo', 'setTimeout', 'console',
    fnSrc + '\nreturn pflxTryEmbedIdentityLogin;');
  const pflxTryEmbedIdentityLogin = fn(sandbox.window, sandbox.findPlayerByBrand, sandbox.loginUser, sandbox.navigateTo, sandbox.setTimeout, sandbox.console);
  return { pflxTryEmbedIdentityLogin, calls, sandboxTimers, sandbox };
}

// Case A: default targetView (omitted) -> mission-control
{
  const { pflxTryEmbedIdentityLogin, calls, sandboxTimers } = runSandbox(fnSrc, {
    findPlayerByBrand: function (b) { return { brand: b }; }
  });
  pflxTryEmbedIdentityLogin('Kaitlin', 2);
  ok('default targetView: loginUser called with the brand', calls.logins[0] === 'Kaitlin');
  // run the deferred navigateTo timer
  sandboxTimers.forEach(function (t) { t(); });
  ok('default targetView: navigates to mission-control when targetView omitted', calls.navigations[0] === 'mission-control');
}

// Case B: explicit targetView 'story' -> navigates to 'story'
{
  const { pflxTryEmbedIdentityLogin, calls, sandboxTimers } = runSandbox(fnSrc, {
    findPlayerByBrand: function (b) { return { brand: b }; }
  });
  pflxTryEmbedIdentityLogin('Marcus', 2, 'story');
  sandboxTimers.forEach(function (t) { t(); });
  ok('explicit targetView "story": navigates to story, not mission-control', calls.navigations[0] === 'story');
}

// Case C: already logged in (activeSession set) -> never clobbers, no login/nav call at all
{
  const { pflxTryEmbedIdentityLogin, calls, sandboxTimers } = runSandbox(fnSrc, {
    activeSession: { brand: 'AlreadyIn' },
    findPlayerByBrand: function (b) { return { brand: b }; }
  });
  pflxTryEmbedIdentityLogin('Someone', 2, 'story');
  ok('already logged in: never calls loginUser', calls.logins.length === 0);
  ok('already logged in: never schedules a navigate timer', sandboxTimers.length === 0);
}

// Case D: player not found yet -> retries with the SAME targetView preserved
{
  const { pflxTryEmbedIdentityLogin, calls, sandboxTimers } = runSandbox(fnSrc, {
    findPlayerByBrand: function (b) { return null; }
  });
  pflxTryEmbedIdentityLogin('Ghost', 1, 'story');
  ok('player not found: no login call yet', calls.logins.length === 0);
  ok('player not found: schedules exactly one retry', sandboxTimers.length === 1);
  // The retry timer itself calls pflxTryEmbedIdentityLogin(brand, attemptsLeft-1, targetView)
  // recursively -- we can't easily intercept that inner recursive call without
  // re-wiring the sandbox, so instead assert the retry call literally appears
  // in the source with targetView preserved (already checked above at the
  // extracted-source level) -- this case confirms it doesn't throw when run.
  let threw = false;
  try { sandboxTimers[0](); } catch (e) { threw = true; }
  ok('retry timer executes without throwing', !threw);
}

// Case E: no brand provided -> safe no-op
{
  const { pflxTryEmbedIdentityLogin, calls, sandboxTimers } = runSandbox(fnSrc, {
    findPlayerByBrand: function (b) { return { brand: b }; }
  });
  pflxTryEmbedIdentityLogin('', 2, 'story');
  ok('empty brand: no login call', calls.logins.length === 0);
  ok('empty brand: no timer scheduled', sandboxTimers.length === 0);
}

// ---- 4. Message listener call site passes msg.targetView through ----
ok('message listener passes msg.targetView as the third arg',
  src.includes('pflxTryEmbedIdentityLogin(msg.brand, 2, msg.targetView);'));
ok('message listener still origin-checks against PFLX_TRUSTED_EMBED_ORIGINS',
  src.includes("PFLX_TRUSTED_EMBED_ORIGINS.indexOf(ev.origin) !== -1) {\n                    pflxTryEmbedIdentityLogin"));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
