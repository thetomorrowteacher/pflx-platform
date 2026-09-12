// Unit tests for PATCH PLATFORM v180: xb-5's "Go Live (Screen)" card in
// X-Bot's Live tab TOOLS sub-tab, wrapping the ALREADY-WORKING OBS/
// YouTube broadcast machinery (ytCreateBroadcast/ytStartBroadcastById/
// ytStopBroadcast, live in Mission Control's own Settings -> YouTube API
// panel). Broadcast CREATION is deliberately NOT reimplemented -- it's
// tightly coupled to specific Settings-page DOM inputs -- so this only
// (a) exposes a new READ-ONLY status getter (ytGetLiveStatus) from the
// existing YouTube IIFE, (b) renders that real status, (c) deep-links to
// the real setup flow, or (d) calls the real ytStopBroadcast() directly
// once a broadcast is already live. Extracts the REAL shipped functions
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

check('PFLX_PATCH bumped to 180', src.indexOf("window.PFLX_PATCH   = 180;") !== -1);

// ── Markup/wiring checks ──
check('Go Live (Screen) card exists in the TOOLS panel', src.indexOf('Go Live (Screen) — via OBS/YouTube') !== -1);
check('#xbot-yt-live-status status container exists', src.indexOf('<div id="xbot-yt-live-status"') !== -1);
check('the honest one-way/10-30s/OBS-not-controlled caveat is shown in the UI, not just documented', src.indexOf("Honest limits: one-way only") !== -1);
check("TOOLS sub-tab switch renders the real YouTube status", src.indexOf("if (tab === 'tools') window.xbotLiveRenderYtStatus();") !== -1);
check('broadcast creation is NOT duplicated -- no new #yt-broadcast-title-style input was added by this patch', src.indexOf('id="xbot-yt-broadcast-title"') === -1);

// ── Sandbox 1: the new read-only ytGetLiveStatus getter, extracted from
// the REAL YouTube Live API Engine IIFE (private ytConfig/ytActiveBroadcast
// closure vars -- this is the only way to exercise the real getter). ──
function makeYtEngineSandbox(opts) {
  opts = opts || {};
  const START = "        // ═══════════════════════════════════════════════════════════\n        // YOUTUBE LIVE API ENGINE\n        // ═══════════════════════════════════════════════════════════\n        (function() {";
  const END_MARKER = "            window.ytGetLiveStatus = function () {\n                return {\n                    connected: !!(ytConfig.apiKey && ytConfig.channelId),\n                    authorized: !!ytConfig.accessToken,\n                    activeBroadcast: ytActiveBroadcast ? { id: ytActiveBroadcast.id, title: ytActiveBroadcast.title } : null\n                };\n            };\n        })();";
  const blockWithMarker = extractBetween(src, START, END_MARKER);

  // Real code inside this IIFE reaches out to several cross-block globals
  // (pflxSafeGet/pflxSafeSet, pflxToast, escapeHtml, PFLX_TRUSTED_EMBED_ORIGINS-
  // adjacent helpers, etc.) at DEFINE time only inside function bodies that
  // are never invoked by this test (we only ever call ytGetLiveStatus,
  // never ytCreateBroadcast/ytApiFetch/etc.), so no stubs are needed for
  // those -- JS doesn't resolve a function body's free variables until
  // that function actually runs.
  const win = {};
  const fn = new Function('window', blockWithMarker);
  fn(win);
  return { win: win };
}

{
  const sb = makeYtEngineSandbox();
  check('ytGetLiveStatus is exposed on window by the real IIFE', typeof sb.win.ytGetLiveStatus === 'function');
}
{
  const sb = makeYtEngineSandbox();
  const status = sb.win.ytGetLiveStatus();
  check('freshly-loaded engine (no config set) reports not connected, not authorized, no active broadcast',
    status.connected === false && status.authorized === false && status.activeBroadcast === null);
}

// ── Sandbox 2: xbotLiveRenderYtStatus / xbotLiveOpenYouTubeSetup /
// xbotLiveEndYouTubeStream, extracted from X-Bot's own script block. ──
function makeXBotSandbox(opts) {
  opts = opts || {};
  const START = 'window.xbotLiveOpenNoiseTool = function () {';
  const END_MARKER = "\n\n        // ══ PATCH PLATFORM v174";
  const blockWithMarker = extractBetween(src, START, END_MARKER);
  const block = blockWithMarker.slice(0, -END_MARKER.length);

  const navigateCalls = [];
  const mcNavCalls = [];
  const mcSettingsTabCalls = [];
  const stopBroadcastCalls = [];
  let statusHtml = null;

  const document_ = {
    getElementById: function (id) {
      if (id === 'xbot-yt-live-status') {
        if (opts.noStatusEl) return null;
        return {
          set innerHTML(v) { statusHtml = v; },
          get innerHTML() { return statusHtml; }
        };
      }
      return null;
    }
  };

  const win = {
    document: document_,
    ytGetLiveStatus: opts.hasStatusFn === false ? undefined : function () { return opts.status || { connected: false, authorized: false, activeBroadcast: null }; },
    ytStopBroadcast: opts.hasStopFn === false ? undefined : function () { stopBroadcastCalls.push(true); },
    xbotLiveRenderYtStatus: undefined, // filled in by the real code itself
  };

  function navigateTo(view) { navigateCalls.push(view); }
  function mcNav(tab) { mcNavCalls.push(tab); }
  function mcSettingsTab(tab) { mcSettingsTabCalls.push(tab); }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  }); }

  const fn = new Function('window', 'document', 'navigateTo', 'mcNav', 'mcSettingsTab', 'escapeHtml', 'setTimeout', block);
  const fakeSetTimeout = opts.runTimers === false
    ? function () {}
    : function (cb) { cb(); }; // run "immediately" for deterministic tests
  fn(win, document_, navigateTo, mcNav, mcSettingsTab, escapeHtml, fakeSetTimeout);

  return {
    win: win,
    navigateCalls: navigateCalls,
    mcNavCalls: mcNavCalls,
    mcSettingsTabCalls: mcSettingsTabCalls,
    stopBroadcastCalls: stopBroadcastCalls,
    getStatusHtml: function () { return statusHtml; },
  };
}

// ── xbotLiveRenderYtStatus: three real render states ──
{
  const sb = makeXBotSandbox({ status: { connected: false, authorized: false, activeBroadcast: null } });
  sb.win.xbotLiveRenderYtStatus();
  const html = sb.getStatusHtml();
  check('not connected: shows "Not connected" and an OPEN YOUTUBE SETUP button', html.indexOf('Not connected to YouTube') !== -1 && html.indexOf('xbotLiveOpenYouTubeSetup()') !== -1);
  check('not connected: never shows END STREAM', html.indexOf('END STREAM') === -1);
}
{
  const sb = makeXBotSandbox({ status: { connected: true, authorized: true, activeBroadcast: null } });
  sb.win.xbotLiveRenderYtStatus();
  const html = sb.getStatusHtml();
  check('authorized but no active broadcast: shows "no broadcast running" and an OPEN YOUTUBE SETUP button', html.indexOf('no broadcast running') !== -1 && html.indexOf('xbotLiveOpenYouTubeSetup()') !== -1);
}
{
  const sb = makeXBotSandbox({ status: { connected: true, authorized: true, activeBroadcast: { id: 'bc1', title: 'Friday Standup <script>' } } });
  sb.win.xbotLiveRenderYtStatus();
  const html = sb.getStatusHtml();
  check('active broadcast: shows LIVE + the real broadcast title', html.indexOf('LIVE') !== -1 && html.indexOf('Friday Standup') !== -1);
  check('active broadcast: title is escaped (no raw <script> tag in the rendered HTML)', html.indexOf('Standup <script>') === -1 && html.indexOf('&lt;script&gt;') !== -1);
  check('active broadcast: shows an END STREAM button wired to xbotLiveEndYouTubeStream', html.indexOf('xbotLiveEndYouTubeStream()') !== -1 && html.indexOf('END STREAM') !== -1);
  check('active broadcast: does NOT show the setup deep-link (already live, nothing to set up)', html.indexOf('xbotLiveOpenYouTubeSetup()') === -1);
}
{
  const sb = makeXBotSandbox({ hasStatusFn: false });
  let threw = false;
  try { sb.win.xbotLiveRenderYtStatus(); } catch (e) { threw = true; }
  check('missing ytGetLiveStatus -> falls back to a safe "not connected" render, never throws', threw === false && sb.getStatusHtml().indexOf('Not connected to YouTube') !== -1);
}
{
  const sb = makeXBotSandbox({ noStatusEl: true, status: { connected: true, authorized: true, activeBroadcast: { id: 'bc1', title: 'X' } } });
  let threw = false;
  try { sb.win.xbotLiveRenderYtStatus(); } catch (e) { threw = true; }
  check('status container not in the DOM (e.g. TOOLS panel not open) -> safe no-op, never throws', threw === false);
}

// ── xbotLiveOpenYouTubeSetup: deep-links through the SAME real
// navigateTo -> mcNav -> mcSettingsTab chain the file's own precedent
// (doNavigate('settings');switchSettingsTab('host');...) already uses. ──
{
  const sb = makeXBotSandbox({});
  sb.win.xbotLiveOpenYouTubeSetup();
  check('deep-link navigates to Mission Control', sb.navigateCalls.length === 1 && sb.navigateCalls[0] === 'mission-control');
  check('deep-link opens the mcsettings panel', sb.mcNavCalls.length === 1 && sb.mcNavCalls[0] === 'mcsettings');
  check('deep-link lands on the youtube settings sub-tab (the real, already-built create-broadcast form)', sb.mcSettingsTabCalls.length === 1 && sb.mcSettingsTabCalls[0] === 'youtube');
}
{
  // If navigateTo/mcNav/mcSettingsTab are ever missing (e.g. a stripped
  // build, or called before those scripts load), this must not throw.
  const win2 = {};
  const START = 'window.xbotLiveOpenNoiseTool = function () {';
  const END_MARKER = "\n\n        // ══ PATCH PLATFORM v174";
  const blockWithMarker = extractBetween(src, START, END_MARKER);
  const block = blockWithMarker.slice(0, -END_MARKER.length);
  const fn = new Function('window', 'setTimeout', block);
  let threw = false;
  try {
    fn(win2, function (cb) { cb(); });
    win2.xbotLiveOpenYouTubeSetup();
  } catch (e) { threw = true; }
  check('deep-link is a safe no-op if navigateTo/mcNav/mcSettingsTab are all undefined', threw === false);
}

// ── xbotLiveEndYouTubeStream: pure delegation to the REAL ytStopBroadcast,
// then re-renders status (so the card reflects the stream ending without
// requiring the host to reopen the TOOLS tab). ──
{
  const sb = makeXBotSandbox({ status: { connected: true, authorized: true, activeBroadcast: { id: 'bc1', title: 'X' } } });
  sb.win.xbotLiveEndYouTubeStream();
  check('END STREAM calls the REAL ytStopBroadcast() -- no separate stop-stream logic invented', sb.stopBroadcastCalls.length === 1);
}
{
  const sb = makeXBotSandbox({ hasStopFn: false, status: { connected: true, authorized: true, activeBroadcast: { id: 'bc1', title: 'X' } } });
  let threw = false;
  try { sb.win.xbotLiveEndYouTubeStream(); } catch (e) { threw = true; }
  check('END STREAM is a safe no-op if ytStopBroadcast is not defined, not a crash', threw === false);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
