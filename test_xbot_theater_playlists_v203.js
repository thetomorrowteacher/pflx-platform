// Unit tests for PATCH PLATFORM v203: Ennis -- "I want to save theater
// playlists. Therefore, I can have a playlist of videos, name the
// playlists and stream the playlists for everyone which will
// automatically play on startup after the intro video and first loading
// screen. The video will play at the exact spot it is streaming so
// players across the globe can experience the same thing at the same
// time. Also, I should see the video name and not some random letters."
// Extracts the REAL shipped code out of preview.html via string-marker
// extraction -- never a reimplementation.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log('PASS: ' + label); }
  else { fail++; console.log('FAIL: ' + label); }
}
function extractUpTo(str, startMarker, nextMarker) {
  const start = str.indexOf(startMarker);
  if (start === -1) throw new Error('start marker not found: ' + startMarker);
  const endIdx = str.indexOf(nextMarker, start + startMarker.length);
  if (endIdx === -1) throw new Error('next marker not found: ' + nextMarker);
  return str.slice(start, endIdx);
}

check('PFLX_PATCH bumped to 203', src.indexOf("window.PFLX_PATCH   = 203;") !== -1);
check('xbotTheaterWatchBodyHtml now takes a startSec param', src.indexOf('window.xbotTheaterWatchBodyHtml = function (videoId, title, startSec) {') !== -1);
check('iframe src appends &start= only when startSec > 0', src.indexOf("(startSec > 0 ? '&start=' + Math.floor(startSec) : '')") !== -1);
check('PLAYLISTS section header replaces old SAVED PLAYLIST header', src.indexOf('📺 PLAYLISTS') !== -1);
check('STREAM TO EVERYONE button exists', src.indexOf('🔴 STREAM TO EVERYONE') !== -1);
check('STREAMING TO EVERYONE status banner exists', src.indexOf('🔴 STREAMING TO EVERYONE') !== -1);

const fetchTitleSrc = extractUpTo(src, 'window.xbotTheaterFetchYouTubeTitle = async function (videoId) {', 'window.xbotTheaterLoadPlaylists = async function () {');
const loadPlaylistsSrc = extractUpTo(src, 'window.xbotTheaterLoadPlaylists = async function () {', 'window.xbotTheaterFindPlaylistItem = function (itemId) {');
const findItemSrc = extractUpTo(src, 'window.xbotTheaterFindPlaylistItem = function (itemId) {', 'window.xbotTheaterCreatePlaylist = async function (name) {');
const createPlSrc = extractUpTo(src, 'window.xbotTheaterCreatePlaylist = async function (name) {', 'window.xbotTheaterCreatePlaylistFromPrompt = async function () {');
const renamePlSrc = extractUpTo(src, 'window.xbotTheaterRenamePlaylist = async function (playlistId, name) {', 'window.xbotTheaterRenamePlaylistFromPrompt = async function (playlistId) {');
const deletePlSrc = extractUpTo(src, 'window.xbotTheaterDeletePlaylist = async function (playlistId) {', 'window.xbotTheaterDeletePlaylistConfirm = async function (playlistId) {');
const addToPlSrc = extractUpTo(src, 'window.xbotTheaterAddToPlaylist = async function (playlistId, input, title) {', 'window.xbotTheaterAddToPlaylistFromInput = async function () {');
const removeFromPlSrc = extractUpTo(src, 'window.xbotTheaterRemoveFromPlaylist = async function (playlistId, itemId) {', 'window.xbotTheaterWatchSaved = function (itemId) {');
const computePosSrc = extractUpTo(src, 'window.xbotTheaterComputeBroadcastPosition = function (items, startedAt, nowMs) {', 'window.xbotTheaterStartBroadcast = async function (playlistId) {');
const startBcSrc = extractUpTo(src, 'window.xbotTheaterStartBroadcast = async function (playlistId) {', 'window.xbotTheaterStopBroadcast = async function () {');
const stopBcSrc = extractUpTo(src, 'window.xbotTheaterStopBroadcast = async function () {', 'window.xbotTheaterWatchBroadcast = function () {');

function makeCfgHarness(initialCfg) {
  const saves = [];
  const win = {
    _xbotLiveCfg: null,
    pflxXBotLoadCfg: async function () { return JSON.parse(JSON.stringify(initialCfg)); },
    pflxXBotSaveCfg: async function (cfg) { saves.push(JSON.parse(JSON.stringify(cfg))); return cfg; },
  };
  return { win: win, saves: saves };
}

(async function () {
  // -- xbotTheaterFetchYouTubeTitle --
  (function () {
    function run(fetchImpl) {
      const fn = new Function('window', 'fetch', fetchTitleSrc + '\nreturn window.xbotTheaterFetchYouTubeTitle;');
      return fn({}, fetchImpl);
    }
    (async function () {
      const t1 = await run(async function (url) {
        return { ok: true, json: async function () { return { title: 'Real Video Title' }; } };
      })('abc12345678');
      check('fetchYouTubeTitle returns the real title from oEmbed', t1 === 'Real Video Title');

      const t2 = await run(async function () { return { ok: false }; })('abc12345678');
      check('fetchYouTubeTitle returns null on a non-ok response (never throws)', t2 === null);

      const t3 = await run(async function () { throw new Error('network down'); })('abc12345678');
      check('fetchYouTubeTitle returns null when fetch itself throws (never propagates)', t3 === null);

      const t4 = await run(async function (url) {
        check('fetchYouTubeTitle requests the real YouTube oEmbed endpoint for the given video id',
          url.indexOf('youtube.com/oembed') !== -1 && url.indexOf('abc12345678') !== -1);
        return { ok: true, json: async function () { return {}; } };
      })('abc12345678');
      check('fetchYouTubeTitle returns null when oEmbed has no title field', t4 === null);
    })();
  })();

  // -- xbotTheaterLoadPlaylists (migration) --
  (function () {
    function run(initialCfg) {
      const h = makeCfgHarness(initialCfg);
      const fn = new Function('window', loadPlaylistsSrc + '\nreturn window.xbotTheaterLoadPlaylists;');
      return { call: fn(h.win), win: h.win, saves: h.saves };
    }
    (async function () {
      // legacy flat cfg.theaterPlaylist migrates into a named "My Playlist"
      let ctx = run({ theaterPlaylist: [{ id: 'p1', videoId: 'En5x-n4slRY', title: 'En5x-n4slRY' }] });
      let result = await ctx.call();
      check('migration wraps an existing flat theaterPlaylist into a named playlist', result.length === 1 && result[0].name === 'My Playlist');
      check('migration preserves the existing items (nothing lost)', result[0].items.length === 1 && result[0].items[0].id === 'p1');
      check('migration persists the new shape via the real save bridge', ctx.saves.length === 1 && Array.isArray(ctx.saves[0].theaterPlaylists));

      // already-migrated cfg is returned as-is, no extra save
      ctx = run({ theaterPlaylists: [{ id: 'pl_x', name: 'Existing', items: [] }] });
      result = await ctx.call();
      check('an already-migrated cfg is returned unchanged', result.length === 1 && result[0].id === 'pl_x');
      check('no migration save happens when theaterPlaylists already exists', ctx.saves.length === 0);

      // no legacy data at all -> empty array, no crash
      ctx = run({});
      result = await ctx.call();
      check('a fresh cfg with nothing saved yet returns an empty playlists array', Array.isArray(result) && result.length === 0);
    })();
  })();

  // -- xbotTheaterFindPlaylistItem --
  (function () {
    const win = {
      _xbotTheaterPlaylistsCache: [
        { id: 'pl1', items: [{ id: 'i1', videoId: 'aaa' }] },
        { id: 'pl2', items: [{ id: 'i2', videoId: 'bbb' }] },
      ],
    };
    const fn = new Function('window', findItemSrc + '\nreturn window.xbotTheaterFindPlaylistItem;');
    const call = fn(win);
    check('findPlaylistItem finds an item in the SECOND playlist (searches across all playlists)', call('i2').videoId === 'bbb');
    check('findPlaylistItem returns null for an id that exists nowhere', call('missing') === null);
  })();

  // -- xbotTheaterCreatePlaylist / RenamePlaylist / DeletePlaylist --
  (function () {
    function runCreate(initialCfg) {
      const h = makeCfgHarness(initialCfg);
      const fn = new Function('window', createPlSrc + '\nreturn window.xbotTheaterCreatePlaylist;');
      return { call: fn(h.win), win: h.win, saves: h.saves };
    }
    function runRename(initialCfg) {
      const h = makeCfgHarness(initialCfg);
      const fn = new Function('window', renamePlSrc + '\nreturn window.xbotTheaterRenamePlaylist;');
      return { call: fn(h.win), win: h.win, saves: h.saves };
    }
    function runDelete(initialCfg) {
      const h = makeCfgHarness(initialCfg);
      const fn = new Function('window', deletePlSrc + '\nreturn window.xbotTheaterDeletePlaylist;');
      return { call: fn(h.win), win: h.win, saves: h.saves };
    }
    (async function () {
      let ctx = runCreate({ theaterPlaylists: [] });
      let pl = await ctx.call('Game Night');
      check('createPlaylist creates a NAMED playlist with the given name', pl && pl.name === 'Game Night');
      check('createPlaylist starts with an empty items array', Array.isArray(pl.items) && pl.items.length === 0);
      check('createPlaylist saves through the real cfg bridge', ctx.saves.length === 1 && ctx.saves[0].theaterPlaylists.length === 1);

      ctx = runCreate({ theaterPlaylists: [] });
      pl = await ctx.call('   ');
      check('createPlaylist refuses a blank/whitespace-only name (no fabricated playlist)', pl === null && ctx.saves.length === 0);

      ctx = runRename({ theaterPlaylists: [{ id: 'pl1', name: 'Old Name', items: [] }] });
      let ok = await ctx.call('pl1', 'New Name');
      check('renamePlaylist updates the real playlist name', ok === true && ctx.saves[0].theaterPlaylists[0].name === 'New Name');

      ctx = runRename({ theaterPlaylists: [{ id: 'pl1', name: 'Old Name', items: [] }] });
      ok = await ctx.call('missing_id', 'New Name');
      check('renamePlaylist fails cleanly for a playlist id that does not exist', ok === false && ctx.saves.length === 0);

      // delete clears an active broadcast pointed at the deleted playlist (no dangling reference)
      ctx = runDelete({ theaterPlaylists: [{ id: 'pl1', name: 'X', items: [] }], theaterBroadcast: { playlistId: 'pl1', startedAt: 1000 } });
      await ctx.call('pl1');
      check('deletePlaylist removes the playlist from the list', ctx.saves[0].theaterPlaylists.length === 0);
      check('deletePlaylist clears theaterBroadcast when it pointed at the deleted playlist (no dangling broadcast)', ctx.saves[0].theaterBroadcast === null);

      // delete a DIFFERENT playlist leaves an unrelated active broadcast alone
      ctx = runDelete({ theaterPlaylists: [{ id: 'pl1', name: 'X', items: [] }, { id: 'pl2', name: 'Y', items: [] }], theaterBroadcast: { playlistId: 'pl1', startedAt: 1000 } });
      await ctx.call('pl2');
      check('deletePlaylist leaves an unrelated active broadcast untouched', ctx.saves[0].theaterBroadcast && ctx.saves[0].theaterBroadcast.playlistId === 'pl1');
    })();
  })();

  // -- xbotTheaterAddToPlaylist (the title-name bug fix) --
  (function () {
    function run(initialCfg, extractIdImpl, fetchTitleImpl) {
      const h = makeCfgHarness(initialCfg);
      h.win.xbotTheaterExtractYouTubeId = extractIdImpl;
      h.win.xbotTheaterFetchYouTubeTitle = fetchTitleImpl;
      const fn = new Function('window', addToPlSrc + '\nreturn window.xbotTheaterAddToPlaylist;');
      return { call: fn(h.win), win: h.win, saves: h.saves };
    }
    (async function () {
      let ctx = run(
        { theaterPlaylists: [{ id: 'pl1', name: 'X', items: [] }] },
        function () { return 'En5x-n4slRY'; },
        async function () { return 'Real Fetched Title'; }
      );
      let item = await ctx.call('pl1', 'https://youtu.be/En5x-n4slRY', '');
      check('addToPlaylist stores the REAL fetched title, not the raw video id (the reported bug)', item.title === 'Real Fetched Title');
      check('addToPlaylist item title is NOT the raw video id string', item.title !== 'En5x-n4slRY');

      // fallback: title fetch fails -> honest fallback to the id (never crashes, never shows "undefined")
      ctx = run(
        { theaterPlaylists: [{ id: 'pl1', name: 'X', items: [] }] },
        function () { return '6V4yOAX69h4'; },
        async function () { return null; }
      );
      item = await ctx.call('pl1', '6V4yOAX69h4', '');
      check('addToPlaylist falls back to the video id only when the real title truly cannot be fetched', item.title === '6V4yOAX69h4');

      // an explicit title passed in short-circuits the fetch entirely
      ctx = run(
        { theaterPlaylists: [{ id: 'pl1', name: 'X', items: [] }] },
        function () { return 'xyz'; },
        async function () { throw new Error('should not be called'); }
      );
      item = await ctx.call('pl1', 'xyz', 'Explicit Title');
      check('addToPlaylist skips the title fetch entirely when a title is already given', item.title === 'Explicit Title');

      // garbage input -> extractor returns null -> no item created
      ctx = run(
        { theaterPlaylists: [{ id: 'pl1', name: 'X', items: [] }] },
        function () { return null; },
        async function () { return 'X'; }
      );
      item = await ctx.call('pl1', 'not a real url', '');
      check('addToPlaylist adds nothing for unextractable garbage input', item === null && ctx.saves.length === 0);

      // unknown playlist id -> refuses cleanly
      ctx = run(
        { theaterPlaylists: [] },
        function () { return 'abc12345678'; },
        async function () { return 'X'; }
      );
      item = await ctx.call('no_such_playlist', 'abc12345678', '');
      check('addToPlaylist refuses when the target playlist does not exist', item === null && ctx.saves.length === 0);
    })();
  })();

  // -- xbotTheaterRemoveFromPlaylist --
  (function () {
    function run(initialCfg, watchingId) {
      const h = makeCfgHarness(initialCfg);
      h.win._xbotTheaterWatchingId = watchingId || null;
      h.win.xbotTheaterRender = function () {};
      const fn = new Function('window', removeFromPlSrc + '\nreturn window.xbotTheaterRemoveFromPlaylist;');
      return { call: fn(h.win), win: h.win, saves: h.saves };
    }
    (async function () {
      let ctx = run({ theaterPlaylists: [{ id: 'pl1', name: 'X', items: [{ id: 'i1' }, { id: 'i2' }] }] });
      await ctx.call('pl1', 'i1');
      check('removeFromPlaylist removes only the targeted item', ctx.saves[0].theaterPlaylists[0].items.length === 1 && ctx.saves[0].theaterPlaylists[0].items[0].id === 'i2');

      ctx = run({ theaterPlaylists: [{ id: 'pl1', name: 'X', items: [{ id: 'i1' }] }] }, 'saved:i1');
      await ctx.call('pl1', 'i1');
      check('removeFromPlaylist clears the watching id when the removed item was the one being watched', ctx.win._xbotTheaterWatchingId === null);
    })();
  })();

  // -- xbotTheaterComputeBroadcastPosition (pure, the sync backbone) --
  (function () {
    const fn = new Function('window', computePosSrc + '\nreturn window.xbotTheaterComputeBroadcastPosition;')({});
    check('no items -> null (never throws)', fn([], 1000, 2000) === null);
    check('no startedAt -> null', fn([{ durationSec: 100 }], null, 2000) === null);

    // single item, known duration, mid-playback
    let r = fn([{ id: 'a', durationSec: 100 }], 0, 30000);
    check('single item: correct item index at 30s into a 100s video', r.itemIndex === 0 && Math.abs(r.elapsedSec - 30) < 0.01);

    // two items, second one started
    r = fn([{ id: 'a', durationSec: 100 }, { id: 'b', durationSec: 200 }], 0, 150000);
    check('two items: lands on the SECOND item once the first ones duration has elapsed', r.itemIndex === 1 && Math.abs(r.elapsedSec - 50) < 0.01);

    // exact boundary -- right at the transition instant
    r = fn([{ id: 'a', durationSec: 100 }, { id: 'b', durationSec: 200 }], 0, 100000);
    check('boundary instant lands on the NEXT item (elapsed is not < first items duration)', r.itemIndex === 1 && Math.abs(r.elapsedSec - 0) < 0.01);

    // loops back to the start once the whole playlist duration has elapsed (a real "channel", not a dead stop)
    r = fn([{ id: 'a', durationSec: 100 }, { id: 'b', durationSec: 200 }], 0, 310000);
    check('loops back to item 0 after the full playlist duration elapses', r.itemIndex === 0 && Math.abs(r.elapsedSec - 10) < 0.01);

    // unknown duration (durationSec null) falls back to the documented 600s default
    r = fn([{ id: 'a', durationSec: null }], 0, 300000);
    check('an item with no discovered duration yet uses the 600s default for position math', r.itemIndex === 0 && Math.abs(r.elapsedSec - 300) < 0.01);

    // two clients computing from the SAME shared startedAt at the SAME "now" get IDENTICAL results -- the actual sync guarantee
    const items = [{ id: 'a', durationSec: 50 }, { id: 'b', durationSec: 75 }, { id: 'c', durationSec: 40 }];
    const shared = { startedAt: 5000, now: 123456 };
    const posA = fn(items, shared.startedAt, shared.now);
    const posB = fn(items, shared.startedAt, shared.now);
    check('two independent calls with the same shared clock produce IDENTICAL positions (the actual sync guarantee)',
      JSON.stringify(posA) === JSON.stringify(posB));
  })();

  // -- xbotTheaterStartBroadcast / StopBroadcast --
  (function () {
    function runStart(initialCfg) {
      const h = makeCfgHarness(initialCfg);
      h.win.xbotTheaterRender = function () {};
      const fn = new Function('window', startBcSrc + '\nreturn window.xbotTheaterStartBroadcast;');
      return { call: fn(h.win), win: h.win, saves: h.saves };
    }
    function runStop(initialCfg, watchingId) {
      const h = makeCfgHarness(initialCfg);
      h.win._xbotTheaterWatchingId = watchingId || null;
      h.win.xbotTheaterRender = function () {};
      const fn = new Function('window', stopBcSrc + '\nreturn window.xbotTheaterStopBroadcast;');
      return { call: fn(h.win), win: h.win, saves: h.saves };
    }
    (async function () {
      const before = Date.now();
      let ctx = runStart({});
      await ctx.call('pl1');
      const saved = ctx.saves[0].theaterBroadcast;
      check('startBroadcast sets the playlist id', saved.playlistId === 'pl1');
      check('startBroadcast stamps a real, current startedAt timestamp (the shared clock)', saved.startedAt >= before && saved.startedAt <= Date.now());

      ctx = runStop({ theaterBroadcast: { playlistId: 'pl1', startedAt: 1000 } }, 'broadcast');
      await ctx.call();
      check('stopBroadcast nulls out theaterBroadcast', ctx.saves[0].theaterBroadcast === null);
      check('stopBroadcast clears the watching id when a client was watching the broadcast', ctx.win._xbotTheaterWatchingId === null);

      ctx = runStop({ theaterBroadcast: { playlistId: 'pl1', startedAt: 1000 } }, 'saved:other-item');
      await ctx.call();
      check('stopBroadcast leaves an UNRELATED watch (a manually-picked saved item) alone', ctx.win._xbotTheaterWatchingId === 'saved:other-item');
    })();
  })();

  setTimeout(function () {
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail > 0 ? 1 : 0);
  }, 100);
})();
