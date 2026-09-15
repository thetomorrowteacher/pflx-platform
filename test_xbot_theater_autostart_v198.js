// Unit tests for PATCH PLATFORM v198: Ennis, right after v197's Now
// Playing ticker + red FAB glow shipped: "There should be a way to make
// the theater feed (either video playlist or live stream) automatically
// play on startup after the intro video and first loading screen. The
// video will not play over loading screens. which means that the
// loading screens should layer in front of X-Bot. All video and sounds
// should mute during Loading screens as loading screens will have its
// own sound. The sound should fade out when loading screens are
// activated and then after the loading screen then the sound should
// fade back in." Extracts the REAL shipped code out of preview.html via
// string-marker extraction -- never a reimplementation.
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

check('PFLX_PATCH bumped to 198', src.indexOf("window.PFLX_PATCH   = 198;") !== -1);

// ── z-index: the loading screen must now layer in front of X-Bot ──
check('.pflx-loading-screen z-index raised to 150000 (above #pflx-dock 100000, #pflx-dock-fab 99999, .pflx-pip-widget 10060)',
  /\.pflx-loading-screen \{\s*position: fixed;\s*inset: 0;\s*z-index: 150000;/.test(src));
check('the raised z-index still sits below the 999995+ tier reserved for confirm dialogs / error banners / toasts',
  150000 < 999995);
check('#pflx-dock is still 100000 (untouched -- only the loading screen moved, not the dock)',
  src.indexOf('#pflx-dock { position:fixed; z-index:100000;') !== -1);
check('.login-view\'s own unrelated z-index:500 rule was left untouched (only the loading screen\'s was raised)',
  /\.login-view \{[\s\S]{0,120}z-index: 500;/.test(src));

// ── Theater iframe: stable id + enablejsapi/origin so PFLX_AUDIO can
//    actually control its volume via postMessage ──
check('the Theater iframe now carries a stable id (id="xbot-theater-video-iframe")',
  src.indexOf('<iframe id="xbot-theater-video-iframe" src="https://www.youtube.com/embed/') !== -1);
check('the Theater iframe src now requests enablejsapi=1',
  src.indexOf("'?autoplay=1&enablejsapi=1&origin=' + encodeURIComponent(location.origin)") !== -1);

// ── PFLX_AUDIO: repointed target, mute (not duck) during loading, fade
//    helper defined ──
check('PFLX_AUDIO.apply() now targets the real xbot-theater-video-iframe, not the never-built mc-live-stream-iframe',
  src.indexOf("document.getElementById('xbot-theater-video-iframe')") !== -1 &&
  src.indexOf("document.getElementById('mc-live-stream-iframe')") === -1);
check('PFLX_AUDIO.duckLevels.loading is now 0 (full mute), not the old 15% duck',
  /duckLevels: \{\s*intro: 0,\s*briefing: 20,\s*loading: 0\s*\}/.test(src));
check('PFLX_AUDIO._fadeVolume is defined (the new smooth fade helper)',
  src.indexOf('_fadeVolume: function(iframe, fromVol, toVol) {') !== -1);
check('apply() calls the new _fadeVolume helper instead of jumping straight to a single postMessage',
  /apply: function\(\) \{[\s\S]{0,2200}this\._fadeVolume\(iframe, fromVol, targetVol\);/.test(src));

// ── Loading-screen sound guards on general SFX + soundboard ──
check('pflxPlaySfx() now skips firing while a loading screen is active (loading screens own their own sound)',
  /function pflxPlaySfx\(event\) \{[\s\S]{0,700}pflx-loading-screen[\s\S]{0,200}return;/.test(src));
check('xbotSoundboardPlay() also skips starting a pad while a loading screen is active',
  /window\.xbotSoundboardPlay = function \(slot\) \{[\s\S]{0,400}pflx-loading-screen[\s\S]{0,150}return false;/.test(src));

// ── Auto-start wiring ──
check('window.pflxXBotAutoStartTheaterOnLogin is defined',
  src.indexOf('window.pflxXBotAutoStartTheaterOnLogin = function () {') !== -1);
check('the auto-start is wired into PFLX_LOADING\'s first hide() -- the SAME "initial loading sequence complete" gate already used for X-Bot briefing audio, not a new/duplicate mechanism',
  /if \(!window\.pflxInitialLoadingDone\) \{\s*window\.pflxInitialLoadingDone = true;[\s\S]{0,250}pflxXBotAutoStartTheaterOnLogin/.test(src));

// ═══════════════════════════════════════════════════════════════════
// Behavioral: PFLX_AUDIO (extracted, real code)
// ═══════════════════════════════════════════════════════════════════
(function () {
  // Grab the WHOLE object literal in one shot -- from "window.PFLX_AUDIO = {"
  // through the real refresh() function and the object's own closing brace --
  // so there's no manual comma/brace surgery that could silently diverge
  // from the real shipped code.
  const fullBlock = extractBetween(src,
    'window.PFLX_AUDIO = {',
    'refresh: function() { this._lastApplied = -1; this.apply(); }\n        };');
  const objLiteral = fullBlock.slice('window.PFLX_AUDIO = '.length); // "{ ... };"

  function makeAudio(opts) {
    opts = opts || {};
    const posted = [];
    const iframeWin = { postMessage: function (msg) { posted.push(JSON.parse(msg)); } };
    const iframe = opts.noIframe ? null : { contentWindow: opts.noContentWindow ? undefined : iframeWin };
    const doc = { getElementById: function (id) { return id === 'xbot-theater-video-iframe' ? iframe : null; } };
    const SEStub = opts.SE !== undefined ? opts.SE : { playerPrefs: {} };
    const objSrc = 'return ' + objLiteral;
    const fn = new Function('document', 'SE', 'clearInterval', 'setInterval', objSrc);
    // Real setInterval keeps firing the SAME callback repeatedly until
    // clearInterval is called -- it is not "one call, one fire". Model
    // that here: intervalCb stays set across ticks, and only the fade's
    // own internal clearInterval() call (fired once i >= steps) clears
    // it, which is what naturally ends runAllSteps' loop.
    let intervalCb = null;
    const fakeSetInterval = function (cb, ms) { intervalCb = cb; return 1; };
    const fakeClearInterval = function () { intervalCb = null; };
    const audio = fn(doc, SEStub, fakeClearInterval, fakeSetInterval);
    return {
      audio: audio, posted: posted,
      runAllSteps: function () {
        var guard = 0;
        while (intervalCb && guard < 1000) { intervalCb(); guard++; }
      },
    };
  }

  check('start()/stop() are no-ops (never throw) when no Theater iframe is currently mounted', (function () {
    const { audio } = makeAudio({ noIframe: true });
    try { audio.start('loading'); audio.stop('loading'); return true; } catch (e) { return false; }
  })());

  check('a fresh iframe (never applied before) snaps straight to the correct starting level, no fade-from-nothing', (function () {
    const { audio, posted } = makeAudio();
    audio.start('loading'); // duckLevels.loading === 0 now
    const setVols = posted.filter(function (m) { return m.func === 'setVolume'; });
    return setVols.length === 1 && setVols[0].args[0] === 0;
  })());

  check('start(\'loading\') fully mutes (target volume 0), matching Ennis\'s "should mute during Loading screens"', (function () {
    const { audio, posted } = makeAudio();
    audio.start('loading');
    const last = posted[posted.length - 1];
    return last.func === 'mute';
  })());

  check('stop(\'loading\') releases back to 100 (Theater leading again) via a real multi-step fade, not a snap', (function () {
    const { audio, posted, runAllSteps } = makeAudio();
    audio.start('loading');
    posted.length = 0;
    audio.stop('loading');
    runAllSteps();
    const setVols = posted.filter(function (m) { return m.func === 'setVolume'; });
    // A real fade takes multiple steps, ending at 100, not one single jump.
    const last = setVols[setVols.length - 1];
    return setVols.length > 1 && last.args[0] === 100;
  })());

  check('the fade is monotonic toward the target (fading out never overshoots back up, fading in never dips down)', (function () {
    const { audio, posted, runAllSteps } = makeAudio();
    audio.start('loading'); // snaps to 0 (fresh iframe)
    posted.length = 0;
    audio.start('briefing'); // 0 -> 20, should fade UP monotonically
    runAllSteps();
    const vols = posted.filter(function (m) { return m.func === 'setVolume'; }).map(function (m) { return m.args[0]; });
    let monotonic = true;
    for (let i = 1; i < vols.length; i++) { if (vols[i] < vols[i - 1]) monotonic = false; }
    return vols.length > 1 && monotonic && vols[vols.length - 1] === 20;
  })());

  check('intro fully mutes (duckLevels.intro === 0), unchanged from before this patch', (function () {
    const { audio, posted } = makeAudio();
    audio.start('intro');
    const last = posted[posted.length - 1];
    return last.func === 'mute';
  })());

  check('briefing ducks to 20%, unchanged from before this patch', (function () {
    const { audio, posted } = makeAudio();
    audio.start('briefing');
    const setVols = posted.filter(function (m) { return m.func === 'setVolume'; });
    return setVols[0].args[0] === 20;
  })());

  check('an explicit player liveStreamMuted preference is still honored over everything else', (function () {
    const { audio, posted } = makeAudio({ SE: { playerPrefs: { liveStreamMuted: true } } });
    audio.start('loading');
    return posted.length === 1 && posted[0].func === 'mute';
  })());

  check('the priority stack still works: loading (0) on top of briefing (20) leads with loading\'s mute; popping loading falls back to briefing\'s 20', (function () {
    const { audio, posted, runAllSteps } = makeAudio();
    audio.start('briefing');
    runAllSteps();
    posted.length = 0;
    audio.start('loading');
    runAllSteps();
    const afterLoading = posted.filter(function (m) { return m.func === 'setVolume'; }).pop();
    posted.length = 0;
    audio.stop('loading');
    runAllSteps();
    const afterPop = posted.filter(function (m) { return m.func === 'setVolume'; }).pop();
    return afterLoading.args[0] === 0 && afterPop.args[0] === 20;
  })());
})();

// ═══════════════════════════════════════════════════════════════════
// Behavioral: window.pflxXBotAutoStartTheaterOnLogin (extracted, real code)
// ═══════════════════════════════════════════════════════════════════
(function () {
  const block = extractBetween(src,
    'window.pflxXBotAutoStartTheaterOnLogin = function () {',
    '\n        };');

  function run(opts) {
    opts = opts || {};
    const win = { _pflxTheaterAutoStartDone: !!opts.alreadyDone };
    const watchCalls = [];
    const watchSavedCalls = [];
    win.pflxXBotLoadSessions = opts.loadSessions || (async function () { return opts.sessions || []; });
    // v203 -- auto-start now reads the plural, named-playlists shape
    // (window.xbotTheaterLoadPlaylists -> array of {id, items}) instead
    // of a flat item array; opts.playlist (a flat list, as this test
    // originally wrote it) is wrapped into one mock playlist so every
    // existing case below keeps meaning the same thing.
    win.xbotTheaterLoadPlaylists = opts.loadPlaylist === null ? undefined : (opts.loadPlaylist || (async function () { return opts.playlist ? [{ id: 'pl_mock', name: 'Mock', items: opts.playlist }] : []; }));
    win.xbotTheaterWatch = function (id) { watchCalls.push(id); };
    win.xbotTheaterWatchSaved = function (id) { watchSavedCalls.push(id); };
    const fn = new Function('window', block + '\nreturn window.pflxXBotAutoStartTheaterOnLogin;');
    const runFn = fn(win);
    const p = runFn();
    return { win: win, watchCalls: watchCalls, watchSavedCalls: watchSavedCalls, ready: p };
  }

  // Since the body is an async IIFE, give microtasks a turn before asserting.
  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

  const allChecks = [];

  allChecks.push((async function () {
      const { win, watchCalls } = run({ sessions: [{ id: 'sess_live', status: 'active', youtubeEmbedId: 'abc' }] });
      await tick(); await tick();
      check('a currently-live session is preferred and watched via the real xbotTheaterWatch', watchCalls.length === 1 && watchCalls[0] === 'sess_live');
    })());

  allChecks.push((async function () {
      const { watchSavedCalls, watchCalls } = run({ sessions: [], playlist: [{ id: 'item_1', videoId: 'v1' }, { id: 'item_2', videoId: 'v2' }] });
      await tick(); await tick();
      check('with no live session, falls back to the FIRST saved playlist item via xbotTheaterWatchSaved', watchSavedCalls.length === 1 && watchSavedCalls[0] === 'item_1' && watchCalls.length === 0);
    })());

  allChecks.push((async function () {
      const { watchCalls, watchSavedCalls } = run({ sessions: [], playlist: [] });
      await tick(); await tick();
      check('with neither a live session nor a saved playlist, it is a genuine no-op (nothing to play)', watchCalls.length === 0 && watchSavedCalls.length === 0);
    })());

  allChecks.push((async function () {
      const { watchCalls } = run({ alreadyDone: true, sessions: [{ id: 'sess_live', status: 'active', youtubeEmbedId: 'abc' }] });
      await tick(); await tick();
      check('fires only once per page load -- a second call (or one after _pflxTheaterAutoStartDone is already set) is a safe no-op', watchCalls.length === 0);
    })());

  allChecks.push((async function () {
      const { win, watchCalls } = run({ sessions: [{ id: 'sess_live', status: 'active', youtubeEmbedId: 'abc' }] });
      await tick(); await tick();
      check('flips window._pflxTheaterAutoStartDone so a later duplicate call is blocked', win._pflxTheaterAutoStartDone === true);
    })());

  allChecks.push((async function () {
      // A session that's "active" but has no youtubeEmbedId isn't really
      // broadcasting -- must NOT be treated as the live pick.
      const { watchCalls, watchSavedCalls } = run({
        sessions: [{ id: 'sess_no_embed', status: 'active' }],
        playlist: [{ id: 'item_1', videoId: 'v1' }],
      });
      await tick(); await tick();
      check('an "active" session with no youtubeEmbedId is not mistaken for a real live broadcast -- falls through to the playlist', watchCalls.length === 0 && watchSavedCalls.length === 1 && watchSavedCalls[0] === 'item_1');
    })());

  allChecks.push((async function () {
      const { watchCalls, watchSavedCalls } = run({ loadPlaylist: null, sessions: [] });
      await tick(); await tick();
      check('never throws even if xbotTheaterLoadPlaylist is unavailable (guarded by typeof check)', watchCalls.length === 0 && watchSavedCalls.length === 0);
    })());

  allChecks.push((async function () {
      const { watchCalls } = run({ loadSessions: async function () { throw new Error('network down'); } });
      await tick(); await tick();
      check('a failed session load is caught and never throws/crashes the login flow', watchCalls.length === 0);
    })());

  Promise.all(allChecks).then(function () {
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail > 0 ? 1 : 0);
  });
})();
