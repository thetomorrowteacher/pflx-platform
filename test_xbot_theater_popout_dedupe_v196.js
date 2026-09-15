// Unit tests for PATCH PLATFORM v196: Ennis, right after confirming the
// v194 PIP fix worked ("When PIP is active then the video should only
// show in PIP. Not in both."): the Theater panel and the pop-out PIP
// were both rendering the SAME live video at once. Extracts the REAL
// shipped code out of preview.html via string-marker extraction -- never
// a reimplementation.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log('PASS: ' + label); }
  else { fail++; console.log('FAIL: ' + label); }
}

function extractBetween(str, startMarker, endMarker) {
  const start = str.indexOf(startMarker);
  if (start === -1) throw new Error('start marker not found: ' + startMarker);
  const endIdx = str.indexOf(endMarker, start);
  if (endIdx === -1) throw new Error('end marker not found: ' + endMarker);
  return str.slice(start, endIdx + endMarker.length);
}

check('PFLX_PATCH bumped to 196', src.indexOf("window.PFLX_PATCH   = 196;") !== -1);

// ── #pip-theater's own titlebar close button now routes through the
// theater-aware xbotTheaterPopIn(), not the bare generic pflxPipClose --
// confirms closing FROM the pop-out re-syncs the main panel too. ──
check('#pip-theater\'s close button now calls xbotTheaterPopIn() (re-syncs the main panel)',
  src.indexOf('<button class="pflx-pip-close" onclick="xbotTheaterPopIn()" title="Close">') !== -1);
check('the bare generic pflxPipClose(\'pip-theater\') call is no longer wired to any button (replaced, not duplicated)',
  src.indexOf("onclick=\"pflxPipClose('pip-theater')\"") === -1);

// ── Build a sandbox around the real block: the new dedupe helper,
// xbotTheaterRender, xbotTheaterPopOut, and the new xbotTheaterPopIn. ──
function makeSandbox(sessions, pipOpenInitially) {
  const END_MARKER = '\n\n        function switchXBotMode(mode) {';
  const blockWithMarker = extractBetween(src, 'window._xbotTheaterWatchingId = null;', END_MARKER);
  const block = blockWithMarker.slice(0, -END_MARKER.length);

  const theaterContent = { innerHTML: '' };
  const pipTheaterBody = { innerHTML: '' };
  const stubDocument = {
    getElementById: function (id) {
      if (id === 'xbot-theater-content') return theaterContent;
      if (id === 'pip-theater-body') return pipTheaterBody;
      return null;
    },
  };
  function escapeHtmlStub(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  var pipOpenState = !!pipOpenInitially;
  var pipOpenCalls = 0, pipCloseCalls = 0;
  const win = {
    pflxXBotLoadSessions: async function () { return sessions; },
    pflxPipOpen: function (id) { pipOpenCalls++; pipOpenState = true; },
    pflxPipClose: function (id) { pipCloseCalls++; pipOpenState = false; },
    pflxPipIsOpen: function (id) { return id === 'pip-theater' && pipOpenState; },
    pflxXBotLoadCfg: async function () { return { cohorts: [] }; },
    pflxXBotSaveCfg: async function () {},
  };

  const fn = new Function('sandbox', 'window', 'document', 'escapeHtml', 'location', block);
  const sandbox = { window: win };
  fn(sandbox, win, stubDocument, escapeHtmlStub, { origin: 'https://www.prototypeflx.com' });

  return {
    win: win,
    theaterContent: theaterContent,
    pipTheaterBody: pipTheaterBody,
    pipOpenCallCount: function () { return pipOpenCalls; },
    pipCloseCallCount: function () { return pipCloseCalls; },
    isPipOpen: function () { return pipOpenState; },
    xbotTheaterRenderList: win.xbotTheaterRenderList,
    xbotTheaterWatch: win.xbotTheaterWatch,
    xbotTheaterPopOut: win.xbotTheaterPopOut,
    xbotTheaterPopIn: win.xbotTheaterPopIn,
  };
}

function mkSession(id, title, status, youtubeEmbedId) {
  return { id: id, title: title, status: status, youtubeEmbedId: youtubeEmbedId };
}

async function main() {
  // ── Watching a video while the PIP is CLOSED renders the real iframe
  // inline, with a POP OUT (PIP) action -- unchanged baseline. ──
  {
    const sb = makeSandbox([mkSession('s1', 'Big Game', 'active', 'vid001')], false);
    await sb.xbotTheaterRenderList();
    sb.xbotTheaterWatch('s1');
    check('PIP closed: the main panel shows the real iframe', sb.theaterContent.innerHTML.indexOf('youtube.com/embed/vid001') !== -1);
    check('PIP closed: the main panel offers POP OUT (PIP)', sb.theaterContent.innerHTML.indexOf('xbotTheaterPopOut()') !== -1);
    check('PIP closed: the main panel does NOT show the "playing in pop-out" notice', sb.theaterContent.innerHTML.indexOf('Playing in the pop-out window') === -1);
  }

  // ── Calling POP OUT: opens the real generic PIP, populates its body,
  // and immediately re-renders the main panel so the video is NEVER
  // shown in both places at once. ──
  {
    const sb = makeSandbox([mkSession('s1', 'Big Game', 'active', 'vid002')], false);
    await sb.xbotTheaterRenderList();
    sb.xbotTheaterWatch('s1');
    sb.xbotTheaterPopOut();
    check('POP OUT populates #pip-theater-body with the real embed', sb.pipTheaterBody.innerHTML.indexOf('youtube.com/embed/vid002') !== -1);
    check('POP OUT calls the real generic pflxPipOpen exactly once', sb.pipOpenCallCount() === 1);
    check('POP OUT: the main panel NO LONGER shows the iframe (this is the actual fix)', sb.theaterContent.innerHTML.indexOf('youtube.com/embed/vid002') === -1);
    check('POP OUT: the main panel shows the "playing in pop-out" notice instead', sb.theaterContent.innerHTML.indexOf('Playing in the pop-out window') !== -1);
    check('POP OUT: the main panel now offers RETURN HERE instead of POP OUT (PIP)', sb.theaterContent.innerHTML.indexOf('xbotTheaterPopIn()') !== -1 && sb.theaterContent.innerHTML.indexOf('xbotTheaterPopOut()') === -1);
    check('POP OUT: BACK is still offered even while popped out', sb.theaterContent.innerHTML.indexOf('xbotTheaterStopWatching()') !== -1);
  }

  // ── xbotTheaterPopIn: the inverse -- closes the real PIP and hands the
  // video back to the inline panel. ──
  {
    const sb = makeSandbox([mkSession('s1', 'Big Game', 'active', 'vid003')], false);
    await sb.xbotTheaterRenderList();
    sb.xbotTheaterWatch('s1');
    sb.xbotTheaterPopOut();
    sb.xbotTheaterPopIn();
    check('POP IN calls the real generic pflxPipClose exactly once', sb.pipCloseCallCount() === 1);
    check('POP IN: the main panel shows the real iframe again', sb.theaterContent.innerHTML.indexOf('youtube.com/embed/vid003') !== -1);
    check('POP IN: the "playing in pop-out" notice is gone', sb.theaterContent.innerHTML.indexOf('Playing in the pop-out window') === -1);
    check('POP IN: POP OUT (PIP) is offered again (not RETURN HERE)', sb.theaterContent.innerHTML.indexOf('xbotTheaterPopOut()') !== -1);
  }

  // ── Whatever closed the PIP -- not just xbotTheaterPopIn -- a fresh
  // render() call is a PURE function of the real pflxPipIsOpen state, so
  // switching tabs away and back (which re-renders) also self-heals. ──
  {
    const sb = makeSandbox([mkSession('s1', 'Big Game', 'active', 'vid004')], true);
    await sb.xbotTheaterRenderList();
    sb.xbotTheaterWatch('s1');
    check('render() reflects an ALREADY-open PIP correctly even without ever calling popOut in this session', sb.theaterContent.innerHTML.indexOf('Playing in the pop-out window') !== -1);
  }

  // ── Regression: the saved-playlist watch branch gets the same dedupe
  // treatment as the live-session branch (shared helper). ──
  {
    const sessions = [];
    const sb = makeSandbox(sessions, false);
    // Seed a saved playlist item directly, bypassing the network load
    // (covered by its own dedicated test, test_xbot_theater_playlist_v177.js).
    sb.win._xbotTheaterPlaylistCache = [{ id: 'p1', videoId: 'savedvid', title: 'Saved Clip' }];
    sb.win._xbotTheaterWatchingId = 'saved:p1';
    sb.win.xbotTheaterRender();
    check('saved-item watch (PIP closed) shows the real iframe', sb.theaterContent.innerHTML.indexOf('youtube.com/embed/savedvid') !== -1);
    sb.xbotTheaterPopOut();
    check('saved-item watch (PIP opened) also switches to the "playing in pop-out" notice, not a duplicate', sb.theaterContent.innerHTML.indexOf('youtube.com/embed/savedvid') === -1 && sb.theaterContent.innerHTML.indexOf('Playing in the pop-out window') !== -1);
  }
}

main().then(function () {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}).catch(function (e) {
  console.error(e);
  console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed (uncaught error)');
  process.exit(1);
});
