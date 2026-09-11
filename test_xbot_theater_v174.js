// Unit tests for PATCH PLATFORM v174: xc-3, the Theater watch panel
// ported from x-live-check's rTheater()/theaterWatch()/
// theaterStopWatching() into X-Bot's Live tab, plus the PIP popout that
// reuses the existing generic pflx-pip-widget framework. Extracts the
// REAL shipped code out of preview.html via brace/string matching --
// never a reimplementation.
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

check('PFLX_PATCH bumped to 174', src.indexOf("window.PFLX_PATCH   = 174;") !== -1);

// ── #pip-theater reuses the EXACT SAME generic pflx-pip-widget markup
// shape as the other three PIP remotes -- confirms it inherits the
// SAME shared drag/resize/preset wiring for free, no new JS needed for
// that part. ──
check('#pip-theater exists as a real .pflx-pip-widget (same framework as #pip-xcoin/#pip-sysevents/#pip-livesession)',
  src.indexOf('<div class="pflx-pip-widget" id="pip-theater"') !== -1);
check('#pip-theater\'s titlebar carries data-pip-drag (picked up by the SAME generic init() drag wiring)',
  src.indexOf('data-pip-drag="pip-theater"') !== -1);
check('#pip-theater has all 8 resize handles wired to data-pip-id="pip-theater" (same generic resize system)',
  (src.match(/data-pip-dir="[a-z]+" data-pip-id="pip-theater"/g) || []).length === 8);
check('#pip-theater has S/M/L presets wired the same way as the other PIP remotes',
  ['small', 'medium', 'large'].every(function (p) { return src.indexOf('data-pip-preset="' + p + '" data-pip-id="pip-theater"') !== -1; }));

// ── Build a sandbox around the real theater block, from
// window._xbotTheaterCache through xbotTheaterPopOut, verbatim. ──
function makeSandbox(sessions) {
  const END_MARKER = '\n\n        function switchXBotMode(mode) {';
  const blockWithMarker = extractBetween(src, 'window._xbotTheaterCache = [];', END_MARKER);
  const block = blockWithMarker.slice(0, -END_MARKER.length);

  const theaterContent = { innerHTML: '' };
  const pipTheaterBody = { innerHTML: '' };
  const pipOpenCalls = [];
  const stubDocument = {
    getElementById: function (id) {
      if (id === 'xbot-theater-content') return theaterContent;
      if (id === 'pip-theater-body') return pipTheaterBody;
      return null;
    },
  };
  function escapeHtmlStub(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  const win = {
    pflxXBotLoadSessions: async function () { return sessions; },
    pflxPipOpen: function (id) { pipOpenCalls.push(id); },
  };

  // The extracted block assigns every function as `window.xbotTheaterX =
  // function () {...}` -- there is no bare `xbotTheaterX` identifier to
  // close over, so read the results back off the `win` stub (the object
  // passed in as the `window` param) rather than referencing bare names.
  const fn = new Function('sandbox', 'window', 'document', 'escapeHtml', block);
  const sandbox = { window: win };
  fn(sandbox, win, stubDocument, escapeHtmlStub);

  return {
    win: win,
    theaterContent: theaterContent,
    pipTheaterBody: pipTheaterBody,
    pipOpenCalls: pipOpenCalls,
    xbotTheaterRender: win.xbotTheaterRender,
    xbotTheaterRenderList: win.xbotTheaterRenderList,
    xbotTheaterWatch: win.xbotTheaterWatch,
    xbotTheaterStopWatching: win.xbotTheaterStopWatching,
    xbotTheaterPopOut: win.xbotTheaterPopOut,
  };
}

function mkSession(id, title, status, youtubeEmbedId) {
  return { id: id, title: title, status: status, youtubeEmbedId: youtubeEmbedId };
}

async function main() {
  // ── xbotTheaterRenderList: loads via the REAL xb-1 bridge function
  // (pflxXBotLoadSessions), caches, filters to live+embedded only ──
  {
    const sessions = [
      mkSession('s1', 'Morning Standup', 'active', 'abc123'),
      mkSession('s2', 'Scheduled Later', 'scheduled', 'def456'),
      mkSession('s3', 'Live, No Broadcast', 'active', null),
      mkSession('s4', 'Ended Stream', 'ended', 'ghi789'),
    ];
    const sb = makeSandbox(sessions);
    await sb.xbotTheaterRenderList();
    check('renderList caches whatever pflxXBotLoadSessions (the real xb-1 bridge) returns', sb.win._xbotTheaterCache === sessions);
    check('renderList shows the one truly live+broadcasting session', sb.theaterContent.innerHTML.indexOf('Morning Standup') !== -1);
    check('a merely-scheduled session (not yet active) is excluded from the watch list', sb.theaterContent.innerHTML.indexOf('Scheduled Later') === -1);
    check('an active session with NO youtubeEmbedId (no broadcast running) is excluded', sb.theaterContent.innerHTML.indexOf('Live, No Broadcast') === -1);
    check('an ended session is excluded even if it once had a youtubeEmbedId', sb.theaterContent.innerHTML.indexOf('Ended Stream') === -1);
    check('the live session shows a WATCH action wired to its real id', sb.theaterContent.innerHTML.indexOf("xbotTheaterWatch('s1')") !== -1);
  }
  {
    const sb = makeSandbox([]);
    await sb.xbotTheaterRenderList();
    check('zero live sessions shows the honest "nothing streaming" message, not an empty panel', sb.theaterContent.innerHTML.indexOf('Nothing streaming right now') !== -1);
  }

  // ── xbotTheaterWatch / xbotTheaterRender: switches to the embed view,
  // matching X-Live's own rTheater() iframe technique ──
  {
    const sessions = [mkSession('s1', 'The Big Game', 'active', 'xyz999')];
    const sb = makeSandbox(sessions);
    await sb.xbotTheaterRenderList();
    sb.xbotTheaterWatch('s1');
    check('watching a session renders a youtube.com/embed iframe with its real embed id',
      sb.theaterContent.innerHTML.indexOf('youtube.com/embed/xyz999') !== -1);
    check('the watch view shows the session title', sb.theaterContent.innerHTML.indexOf('The Big Game') !== -1);
    check('the watch view offers a POP OUT (PIP) action', sb.theaterContent.innerHTML.indexOf('xbotTheaterPopOut()') !== -1);
    check('the watch view offers a BACK action', sb.theaterContent.innerHTML.indexOf('xbotTheaterStopWatching()') !== -1);
  }
  {
    // watching a session that ends (or loses its broadcast) mid-watch
    // falls back to the list instead of showing a dead/stale embed.
    const sessions = [mkSession('s1', 'Live Now', 'active', 'abc123')];
    const sb = makeSandbox(sessions);
    await sb.xbotTheaterRenderList();
    sb.xbotTheaterWatch('s1');
    sessions[0].status = 'ended';
    sb.xbotTheaterRender();
    check('re-rendering after the watched session ends falls back to the list view, not a stale embed',
      sb.theaterContent.innerHTML.indexOf('youtube.com/embed') === -1);
  }
  {
    const sessions = [mkSession('s1', 'Live Now', 'active', 'abc123')];
    const sb = makeSandbox(sessions);
    await sb.xbotTheaterRenderList();
    sb.xbotTheaterWatch('s1');
    sb.xbotTheaterStopWatching();
    check('stopping watching returns to the session list', sb.theaterContent.innerHTML.indexOf('youtube.com/embed') === -1 && sb.theaterContent.innerHTML.indexOf('Live Now') !== -1);
  }

  // ── xbotTheaterPopOut: renders the SAME embed into #pip-theater-body
  // and opens it through the real generic pflxPipOpen -- no bespoke PIP
  // logic of its own. ──
  {
    const sessions = [mkSession('s1', 'Popout Test', 'active', 'popout1')];
    const sb = makeSandbox(sessions);
    await sb.xbotTheaterRenderList();
    sb.xbotTheaterWatch('s1');
    sb.xbotTheaterPopOut();
    check('popping out renders the same broadcast into #pip-theater-body', sb.pipTheaterBody.innerHTML.indexOf('youtube.com/embed/popout1') !== -1);
    check('popping out calls the REAL generic pflxPipOpen(\'pip-theater\') -- reuses the shared PIP framework, no bespoke open logic', sb.pipOpenCalls.length === 1 && sb.pipOpenCalls[0] === 'pip-theater');
  }
  {
    // popping out with nothing being watched is a safe no-op
    const sb = makeSandbox([]);
    sb.xbotTheaterPopOut();
    check('popping out while nothing is being watched is a silent no-op, not a crash', sb.pipOpenCalls.length === 0 && sb.pipTheaterBody.innerHTML === '');
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
