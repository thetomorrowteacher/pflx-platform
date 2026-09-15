// Unit tests for PATCH PLATFORM v197: Ennis, right after confirming v196
// ("PIP is active then the video should only show in PIP") shipped:
// "There should be a Now Playing indicator moving across the bottom
// ticker indicating the video that is playing in the theater. X-Bot
// should be glowing and pulsating red." Extracts the REAL shipped code
// out of preview.html via string-marker extraction -- never a
// reimplementation.
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

// ── Markup / wiring checks ──
check('PFLX_PATCH bumped to 197', src.indexOf("window.PFLX_PATCH   = 197;") !== -1);

check('new pflxFabPlaying keyframes defined',
  src.indexOf('@keyframes pflxFabPlaying {') !== -1);
check('pflxFabPlaying keyframes reuse the red accent color (#ff0050), matching the Now Playing ticker line',
  /@keyframes pflxFabPlaying \{[\s\S]{0,300}rgba\(255,0,80,/.test(src));

check('#pflx-dock-fab.playing rule defined',
  src.indexOf("#pflx-dock-fab.playing {") !== -1);
check('.playing rule reuses the existing pflxFabBobBig bob keyframe (DRY, matches .newmsg\'s pattern)',
  /#pflx-dock-fab\.playing \{[\s\S]{0,300}pflxFabBobBig/.test(src));

check('window.pflxDockSetTheaterPlaying defined',
  src.indexOf('window.pflxDockSetTheaterPlaying = function (isPlaying) {') !== -1);
check('public window.pflxDock API now exposes setTheaterPlaying',
  /window\.pflxDock = \{[^}]*setTheaterPlaying: window\.pflxDockSetTheaterPlaying/.test(src));

check('xbotTheaterRender wires pflxDockSetTheaterPlaying at its top',
  src.indexOf("if (typeof window.pflxDockSetTheaterPlaying === 'function') window.pflxDockSetTheaterPlaying(!!window._xbotTheaterWatchingId);") !== -1);
check('xbotTheaterRender wires pflxRenderTicker at its top',
  src.indexOf("if (typeof window.pflxRenderTicker === 'function') window.pflxRenderTicker();") !== -1);
check('the two new wiring lines run BEFORE the render bails out on a missing panel element (so they fire even if the Theater tab isn\'t open)',
  (function () {
    const renderStart = src.indexOf('window.xbotTheaterRender = function () {');
    const setterCallIdx = src.indexOf("window.pflxDockSetTheaterPlaying(!!window._xbotTheaterWatchingId);", renderStart);
    const bodyLookupIdx = src.indexOf("var body = document.getElementById('xbot-theater-content');", renderStart);
    return renderStart !== -1 && setterCallIdx !== -1 && bodyLookupIdx !== -1 && setterCallIdx < bodyLookupIdx;
  })());

// ── Behavioral: window.pflxDockSetTheaterPlaying (extracted, real code) ──
(function () {
  const block = extractBetween(src,
    'window.pflxDockSetTheaterPlaying = function (isPlaying) {',
    '\n            };');
  function makeSetter(fab) {
    const win = {};
    const fn = new Function('window', 'fab', block + '\nreturn window.pflxDockSetTheaterPlaying;');
    return fn(win, fab);
  }

  check('setter is a safe no-op when fab is missing (never throws)', (function () {
    try { makeSetter(null)(true); return true; } catch (e) { return false; }
  })());

  check('setter adds .playing when isPlaying is truthy', (function () {
    const calls = [];
    const fab = { classList: { toggle: function (cls, on) { calls.push([cls, on]); } } };
    makeSetter(fab)(true);
    return calls.length === 1 && calls[0][0] === 'playing' && calls[0][1] === true;
  })());

  check('setter removes .playing when isPlaying is false', (function () {
    const calls = [];
    const fab = { classList: { toggle: function (cls, on) { calls.push([cls, on]); } } };
    makeSetter(fab)(false);
    return calls.length === 1 && calls[0][0] === 'playing' && calls[0][1] === false;
  })());

  check('setter coerces a truthy non-boolean (e.g. a session id string) to a real boolean via !!', (function () {
    const calls = [];
    const fab = { classList: { toggle: function (cls, on) { calls.push([cls, on]); } } };
    makeSetter(fab)('sess_123');
    return calls.length === 1 && calls[0][1] === true && typeof calls[0][1] === 'boolean';
  })());

  check('setter coerces undefined/null to false', (function () {
    const calls = [];
    const fab = { classList: { toggle: function (cls, on) { calls.push([cls, on]); } } };
    makeSetter(fab)(undefined);
    return calls.length === 1 && calls[0][1] === false;
  })());
})();

// ── Behavioral: buildMCTickerEvents' new "Now Playing" block (extracted, real code) ──
(function () {
  const fnSrc = extractBetween(src,
    'function buildMCTickerEvents() {',
    '\n        }\n\n        // ── Render the ticker bar ──');

  function run(winState, liveStreamFn) {
    const win = winState;
    const fn = new Function('window', 'pflxGetLiveStream',
      fnSrc + '\nreturn buildMCTickerEvents();');
    return fn(win, liveStreamFn || function () { return null; });
  }

  function nowPlayingEvents(events) {
    return events.filter(function (e) { return e.source === 'theater'; });
  }

  check('no Now Playing line when nothing is being watched', (function () {
    const events = run({ _xbotTheaterWatchingId: null });
    return nowPlayingEvents(events).length === 0;
  })());

  check('Now Playing line appears for a live session currently being watched, with its real title', (function () {
    const events = run({
      _xbotTheaterWatchingId: 'sess_1',
      _xbotTheaterCache: [{ id: 'sess_1', title: 'Friday Algebra Live', status: 'active', youtubeEmbedId: 'abc' }],
    });
    const np = nowPlayingEvents(events);
    return np.length === 1 && np[0].text === 'NOW PLAYING — Friday Algebra Live';
  })());

  check('Now Playing line uses the icon/color tied thematically to the red FAB glow',
    (function () {
      const events = run({
        _xbotTheaterWatchingId: 'sess_1',
        _xbotTheaterCache: [{ id: 'sess_1', title: 'X', status: 'active', youtubeEmbedId: 'abc' }],
      });
      const np = nowPlayingEvents(events)[0];
      return np && np.icon === '▶️' && np.color === '#ff0050';
    })());

  check('falls back to "Live Stream" when a watched live session has no title', (function () {
    const events = run({
      _xbotTheaterWatchingId: 'sess_2',
      _xbotTheaterCache: [{ id: 'sess_2', status: 'active', youtubeEmbedId: 'abc' }],
    });
    const np = nowPlayingEvents(events);
    return np.length === 1 && np[0].text === 'NOW PLAYING — Live Stream';
  })());

  check('a stale watched id no longer present in the live cache produces no Now Playing line (never throws)', (function () {
    const events = run({
      _xbotTheaterWatchingId: 'sess_gone',
      _xbotTheaterCache: [],
    });
    return nowPlayingEvents(events).length === 0;
  })());

  check('Now Playing line appears for a saved playlist item ("saved:" prefix), with its real title', (function () {
    const events = run({
      _xbotTheaterWatchingId: 'saved:item_9',
      _xbotTheaterPlaylistCache: [{ id: 'item_9', videoId: 'xyz', title: 'Intro to Fractions' }],
    });
    const np = nowPlayingEvents(events);
    return np.length === 1 && np[0].text === 'NOW PLAYING — Intro to Fractions';
  })());

  check('falls back to "Saved Video" when a watched playlist item has no title', (function () {
    const events = run({
      _xbotTheaterWatchingId: 'saved:item_10',
      _xbotTheaterPlaylistCache: [{ id: 'item_10', videoId: 'xyz' }],
    });
    const np = nowPlayingEvents(events);
    return np.length === 1 && np[0].text === 'NOW PLAYING — Saved Video';
  })());

  check('a "saved:" id not present in the playlist cache produces no Now Playing line (never throws)', (function () {
    const events = run({
      _xbotTheaterWatchingId: 'saved:item_missing',
      _xbotTheaterPlaylistCache: [],
    });
    return nowPlayingEvents(events).length === 0;
  })());

  check('live-session ids and "saved:" playlist ids never collide (same raw id, different watch state)', (function () {
    const eventsLive = run({
      _xbotTheaterWatchingId: '42',
      _xbotTheaterCache: [{ id: '42', title: 'Live Forty-Two', status: 'active', youtubeEmbedId: 'a' }],
      _xbotTheaterPlaylistCache: [{ id: '42', videoId: 'b', title: 'Saved Forty-Two' }],
    });
    const eventsSaved = run({
      _xbotTheaterWatchingId: 'saved:42',
      _xbotTheaterCache: [{ id: '42', title: 'Live Forty-Two', status: 'active', youtubeEmbedId: 'a' }],
      _xbotTheaterPlaylistCache: [{ id: '42', videoId: 'b', title: 'Saved Forty-Two' }],
    });
    const npLive = nowPlayingEvents(eventsLive)[0];
    const npSaved = nowPlayingEvents(eventsSaved)[0];
    return npLive && npSaved && npLive.text === 'NOW PLAYING — Live Forty-Two' && npSaved.text === 'NOW PLAYING — Saved Forty-Two';
  })());

  check('this is a per-viewer state, distinct from the pre-existing global "LIVE NOW" line -- both can appear together',
    (function () {
      const events = run({
        _xbotTheaterWatchingId: 'sess_1',
        _xbotTheaterCache: [{ id: 'sess_1', title: 'My Watch', status: 'active', youtubeEmbedId: 'abc' }],
      }, function () { return { active: true, title: 'Someone Else Broadcasting' }; });
      const hasLiveNow = events.some(function (e) { return e.text.indexOf('LIVE NOW') === 0; });
      const hasNowPlaying = events.some(function (e) { return e.text.indexOf('NOW PLAYING') === 0; });
      return hasLiveNow && hasNowPlaying;
    })());

  check('a missing pflxGetLiveStream global does not prevent the Now Playing block from still running (independent try/catch blocks)',
    (function () {
      const win = {
        _xbotTheaterWatchingId: 'sess_1',
        _xbotTheaterCache: [{ id: 'sess_1', title: 'Still Works', status: 'active', youtubeEmbedId: 'abc' }],
      };
      const fn = new Function('window', 'pflxGetLiveStream',
        fnSrc.replace('var stream = pflxGetLiveStream();', 'var stream = pflxGetLiveStreamUNDEFINED();') +
        '\nreturn buildMCTickerEvents();');
      const events = fn(win, function () { return null; });
      const np = nowPlayingEvents(events);
      return np.length === 1 && np[0].text === 'NOW PLAYING — Still Works';
    })());
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
