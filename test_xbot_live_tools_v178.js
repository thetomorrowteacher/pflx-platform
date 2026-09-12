// Unit tests for PATCH PLATFORM v178: xb-4's "consolidated Live Tools"
// ask, built as pure delegation to TWO already-real, already-working
// PFLX features -- no new award/noise logic. #pip-xcoin (the X-Coin
// quick-award remote, opened via pflxXcPipOpen()) already has a full
// player-target picker, Give/Fine XC amounts, custom amounts, and 4
// badge quick-awards, writing through the real mcPlayers +
// mcSaveData()/mcBroadcastToApps() path. mcToggleNoiseMeter() is the
// SAME real function the Controller Grid's 'noise' action (v176)
// already dispatches to. This patch just adds a one-tap TOOLS sub-tab
// in X-Bot's Live tab so a host doesn't need to leave it. Extracts the
// REAL shipped functions out of preview.html via brace/string matching
// -- never a reimplementation.
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

check('PFLX_PATCH bumped to 178', src.indexOf("window.PFLX_PATCH   = 178;") !== -1);

// ── Markup checks ──
check('TOOLS sub-tab pill exists, wired to xbotLiveSwitchSubTab', src.indexOf('data-subtab="tools" onclick="xbotLiveSwitchSubTab(\'tools\')"') !== -1);
check('#xbot-live-tools-panel exists', src.indexOf('<div id="xbot-live-tools-panel"') !== -1);
check('the Award/Fine/Badges launcher button calls the real xbotLiveOpenAwardTool', src.indexOf('onclick="xbotLiveOpenAwardTool()"') !== -1);
check('the Noise Meter launcher button calls the real xbotLiveOpenNoiseTool', src.indexOf('onclick="xbotLiveOpenNoiseTool()"') !== -1);
check("xbotLiveSwitchSubTab's panel map includes tools -> xbot-live-tools-panel", src.indexOf("tools: 'xbot-live-tools-panel'") !== -1);

// ── Sandbox: extract the real launcher functions (defined right after
// pflxXBotClearTeams, before the v174 Theater block begins) and
// confirm they delegate to whatever the REAL global pflxXcPipOpen/
// mcToggleNoiseMeter happen to be -- pure pass-through, no
// reimplementation, and a safe no-op if either global is ever absent
// (e.g. not yet defined at boot, or on a stripped-down build). ──
function makeSandbox(opts) {
  opts = opts || {};
  const START = 'window.xbotLiveOpenAwardTool = function () {';
  const END_MARKER = '\n\n        // ══ PATCH PLATFORM v174';
  const blockWithMarker = extractBetween(src, START, END_MARKER);
  const block = blockWithMarker.slice(0, -END_MARKER.length);

  const win = {
    pflxXcPipOpen: opts.hasAwardFn === false ? undefined : function () { win._awardOpenCalls.push(true); },
    mcToggleNoiseMeter: opts.hasNoiseFn === false ? undefined : function () { win._noiseToggleCalls.push(true); },
    _awardOpenCalls: [],
    _noiseToggleCalls: [],
  };

  const fn = new Function('window', block);
  fn(win);

  return {
    win: win,
    xbotLiveOpenAwardTool: win.xbotLiveOpenAwardTool,
    xbotLiveOpenNoiseTool: win.xbotLiveOpenNoiseTool,
  };
}

// ── xbotLiveOpenAwardTool: delegates to the real pflxXcPipOpen ──
{
  const sb = makeSandbox();
  sb.xbotLiveOpenAwardTool();
  check('xbotLiveOpenAwardTool calls the REAL pflxXcPipOpen (the already-proven X-Coin quick-award remote) -- no separate award UI invented', sb.win._awardOpenCalls.length === 1);
}
{
  // if the real function is ever missing (e.g. this section loaded
  // before that code, or a stripped build), this must not throw.
  const sb = makeSandbox({ hasAwardFn: false });
  let threw = false;
  try { sb.xbotLiveOpenAwardTool(); } catch (e) { threw = true; }
  check('xbotLiveOpenAwardTool is a safe no-op if pflxXcPipOpen is not defined, not a crash', threw === false);
}

// ── xbotLiveOpenNoiseTool: delegates to the real mcToggleNoiseMeter,
// the SAME function the Controller Grid's 'noise' action (v176) uses ──
{
  const sb = makeSandbox();
  sb.xbotLiveOpenNoiseTool();
  check('xbotLiveOpenNoiseTool calls the REAL mcToggleNoiseMeter -- the same function the Controller Grid already dispatches to, no separate noise system', sb.win._noiseToggleCalls.length === 1);
}
{
  const sb = makeSandbox({ hasNoiseFn: false });
  let threw = false;
  try { sb.xbotLiveOpenNoiseTool(); } catch (e) { threw = true; }
  check('xbotLiveOpenNoiseTool is a safe no-op if mcToggleNoiseMeter is not defined, not a crash', threw === false);
}

// ── Confirm the two launchers are genuinely independent -- calling one
// never touches the other's tracked call count. ──
{
  const sb = makeSandbox();
  sb.xbotLiveOpenAwardTool();
  check('calling the award launcher does not also trigger the noise toggle', sb.win._noiseToggleCalls.length === 0);
}
{
  const sb = makeSandbox();
  sb.xbotLiveOpenNoiseTool();
  check('calling the noise launcher does not also trigger the award remote', sb.win._awardOpenCalls.length === 0);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
