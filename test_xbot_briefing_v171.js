// Unit tests for PATCH PLATFORM v171: three small X-Bot behavior fixes
// (briefings render into X-Bot chat instead of a floating card, X-Bot
// auto-opens on login/app-load, the FAB renders behind the open dock).
// Extracts the REAL shipped code out of preview.html via brace/string
// matching -- never a reimplementation.
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

// ── Version bump ──
check('PFLX_PATCH bumped to 171', src.indexOf("window.PFLX_PATCH   = 171;") !== -1);

// ── Fix 3: FAB z-index now behind the dock's 100000 ──
check("#pflx-dock-fab z-index lowered to 99999 (below #pflx-dock's 100000)",
  src.indexOf('#pflx-dock-fab { position:fixed; z-index:99999;') !== -1);
check("#pflx-dock still at z-index:100000 (unchanged -- fab must sit UNDER it, not the other way around)",
  src.indexOf('#pflx-dock { position:fixed; z-index:100000;') !== -1);

// ── Fix 1: pflxXBotBrief (the real, first-defined one) renders into X-Bot
// chat via xbotAddMessage, not a standalone document.body-appended card ──
const briefStart = 'window.pflxXBotBrief = function (viewName) {';
const briefFn = extractBetween(src, briefStart, '\n          };');
check('the real pflxXBotBrief still gates on visitedTabs (once-per-tab-per-session)',
  briefFn.indexOf('visitedTabs[key]') !== -1);
check('the real pflxXBotBrief now calls xbotAddMessage(msg, false, \'briefing\')',
  briefFn.indexOf("xbotAddMessage(msg, false, 'briefing')") !== -1);
check('the real pflxXBotBrief no longer builds a standalone document.body-appended card',
  briefFn.indexOf('document.body.appendChild(el)') === -1);
check('the real pflxXBotBrief no longer has a 6s auto-dismiss timer',
  briefFn.indexOf('setTimeout(function () { dismiss(); }, 6000)') === -1);
check('the real pflxXBotBrief no longer defines a dismiss() closure',
  briefFn.indexOf('function dismiss()') === -1);
check('the SFX-after-loading-sequence guard is preserved (unchanged behavior)',
  briefFn.indexOf('window.pflxInitialLoadingDone') !== -1);

// ── Fix 1b: the audio-ducking monkey-patch (the SECOND pflxXBotBrief
// assignment) no longer watches for DOM removal of an element that can
// never be removed now -- it stops ducking on a flat safety timeout ──
const monkeyStart = src.indexOf(briefStart, src.indexOf(briefStart) + 1);
check('a second pflxXBotBrief assignment (the audio-ducking monkey-patch) exists', monkeyStart !== -1);
const monkeyFn = extractBetween(src, briefStart, '\n          };', monkeyStart);
check('the monkey-patch no longer queries [data-xbot-briefing] (that attribute/element no longer exists)',
  monkeyFn.indexOf('data-xbot-briefing') === -1);
check('the monkey-patch no longer uses a MutationObserver to detect briefing removal',
  monkeyFn.indexOf('new MutationObserver') === -1);
check('the monkey-patch still stops audio ducking on a safety timeout',
  monkeyFn.indexOf("window.PFLX_AUDIO && window.PFLX_AUDIO.stop('briefing')") !== -1);
check('the monkey-patch still ducks audio via PFLX_AUDIO.start(\'briefing\') before showing (unchanged)',
  monkeyFn.indexOf("window.PFLX_AUDIO.start('briefing')") !== -1);
check('the monkey-patch still calls the original briefing fn (origBrief.call) -- wrapping preserved, not replaced',
  monkeyFn.indexOf('origBrief.call(this, viewName)') !== -1);

// ── Fix 2: auto-open X-Bot on login/app-load -- extract the real retry
// helper and actually run its retry/give-up logic with fake timers,
// rather than just asserting the string is present. ──
const autoOpenSrc = extractBetween(
  src,
  '(function pflxXBotAutoOpenOnLogin() {',
  '\n                })();'
);
check('the auto-open helper is inserted right after initPlatform(displayName) in loginUser()\'s post-login block',
  src.indexOf('initPlatform(displayName);\n                // v171 (Ennis): "Always automatically open') !== -1);

{
  // pflxDock already exists on the very first check -- opens immediately,
  // no retry needed.
  let attempt = 0;
  const opens = [];
  const win = { pflxDock: { open: function (tab) { opens.push(tab); } } };
  const fakeSetTimeout = function () { throw new Error('should not need to retry when pflxDock is already present'); };
  const runner = new Function('window', 'setTimeout', autoOpenSrc);
  runner(win, fakeSetTimeout);
  check('pflxDock already ready -> opens immediately to the xbot tab, no retry scheduled', opens.length === 1 && opens[0] === 'xbot');
}

{
  // pflxDock doesn't exist yet (the real startup race) -- helper must
  // retry via setTimeout rather than throwing or silently giving up
  // instantly.
  let scheduled = 0;
  const win = {};
  const fakeSetTimeout = function (fn, ms) {
    scheduled++;
    if (scheduled === 1) {
      check('retry is scheduled at the documented 250ms interval', ms === 250);
      win.pflxDock = { open: function (tab) { win._opened = tab; } };
      fn(); // simulate the timer firing once pflxDock is now available
    }
  };
  const runner = new Function('window', 'setTimeout', autoOpenSrc);
  runner(win, fakeSetTimeout);
  check('pflxDock not ready on first check -> retries, then opens to xbot tab once available', win._opened === 'xbot');
}

{
  // pflxDock never becomes available -- must give up after a bounded
  // number of retries (not an infinite loop / runaway timer chain).
  let scheduled = 0;
  const win = {};
  const fakeSetTimeout = function (fn, ms) {
    scheduled++;
    if (scheduled > 100) throw new Error('runaway retry loop -- never gives up');
    fn();
  };
  const runner = new Function('window', 'setTimeout', autoOpenSrc);
  runner(win, fakeSetTimeout);
  // First attempt runs synchronously (tries=1); each subsequent attempt is
  // one setTimeout call. The loop stops scheduling once tries reaches the
  // documented cap of 40 (tries < 40 false on the 40th attempt), so the
  // 40 total attempt() invocations account for 39 setTimeout calls.
  check('pflxDock never appears -> retry loop gives up after a bounded number of attempts (documented cap of 40)', scheduled === 39);
}

{
  // A broken/throwing pflxDock.open must not crash the whole login flow --
  // the real code wraps the call in try/catch.
  const win = { pflxDock: { open: function () { throw new Error('boom'); } } };
  const fakeSetTimeout = function () { throw new Error('should not retry -- pflxDock was present, the open() call itself threw'); };
  const runner = new Function('window', 'setTimeout', autoOpenSrc);
  let threw = false;
  try { runner(win, fakeSetTimeout); } catch (e) { threw = true; }
  check('a throwing pflxDock.open() is caught, never crashes the login flow', !threw);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
