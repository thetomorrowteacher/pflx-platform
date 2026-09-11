// Unit tests for PATCH PLATFORM v177: the saved YouTube playlist for
// X-Bot's Theater tab, backlogged since xc-3 (v174). Ports X-Live's own
// pflxYouTubeExtractId regex logic (same, not reinvented) and stores a
// host-curated list of {id, videoId, title} entries via the SAME xb-2
// pflxXBotLoadCfg/pflxXBotSaveCfg bridge xc-2's Teams board already
// uses (cfg.theaterPlaylist). A saved item plays through the EXACT SAME
// watch/embed/PIP-popout code path a live broadcast does -- this test
// re-verifies the ORIGINAL v174 live-session behavior is unchanged
// (regression) alongside the new saved-playlist behavior. Extracts the
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

check('PFLX_PATCH bumped to 177', src.indexOf("window.PFLX_PATCH   = 177;") !== -1);

// ── Markup: the new add-a-video input is dynamically rendered (not
// static HTML), so this is verified via the sandboxed render tests
// below, not a static grep. Confirm the class hook exists in the
// source (used for CSS/future styling), and the theater panel itself
// is unchanged/still present. ──
check('#xbot-live-theater-panel still exists (unchanged from v174)', src.indexOf('<div id="xbot-live-theater-panel"') !== -1);
check('the new playlist section has a stable CSS hook (xbot-theater-playlist-section)', src.indexOf('xbot-theater-playlist-section') !== -1);

// ── Sandbox the real shipped theater block (now extended for v177),
// same start marker as v174's own test. This block also contains the
// v175 Soundboard and v176 Controller code ahead of the end marker
// (same as v175/v176's own tests already had to account for) -- those
// extra top-level `window.X = function(){}` assignments are inert
// unless called, so including them is harmless. ──
function makeSandbox(sessions, opts) {
  opts = opts || {};
  const END_MARKER = '\n\n        function switchXBotMode(mode) {';
  const blockWithMarker = extractBetween(src, 'window._xbotTheaterCache = [];', END_MARKER);
  const block = blockWithMarker.slice(0, -END_MARKER.length);

  const theaterContent = { innerHTML: '' };
  const pipTheaterBody = { innerHTML: '' };
  const playlistInput = { value: opts.inputValue || '', style: {} };
  const pipOpenCalls = [];
  const els = {
    'xbot-theater-content': theaterContent,
    'pip-theater-body': pipTheaterBody,
    'xbot-theater-playlist-input': playlistInput,
  };
  const stubDocument = { getElementById: function (id) { return els[id] || null; } };
  function escapeHtmlStub(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  // cfg persistence stub, matching the SAME single-row upsert shape
  // xc-2's Teams board already established (pflxXBotLoadCfg/SaveCfg) --
  // a plain in-memory object standing in for the Supabase-backed row.
  let cloudCfg = opts.initialCfg ? JSON.parse(JSON.stringify(opts.initialCfg)) : { cohorts: [] };
  const win = {
    pflxXBotLoadSessions: async function () { return sessions || []; },
    pflxXBotLoadCfg: async function () { return JSON.parse(JSON.stringify(cloudCfg)); },
    pflxXBotSaveCfg: async function (cfg) { cloudCfg = JSON.parse(JSON.stringify(cfg)); },
    pflxPipOpen: function (id) { pipOpenCalls.push(id); },
  };

  const fn = new Function('sandbox', 'window', 'document', 'escapeHtml', block);
  const sandbox = { window: win };
  fn(sandbox, win, stubDocument, escapeHtmlStub);

  return {
    win: win,
    theaterContent: theaterContent,
    pipTheaterBody: pipTheaterBody,
    playlistInput: playlistInput,
    pipOpenCalls: pipOpenCalls,
    getCloudCfg: function () { return cloudCfg; },
    xbotTheaterRender: win.xbotTheaterRender,
    xbotTheaterRenderList: win.xbotTheaterRenderList,
    xbotTheaterWatch: win.xbotTheaterWatch,
    xbotTheaterStopWatching: win.xbotTheaterStopWatching,
    xbotTheaterPopOut: win.xbotTheaterPopOut,
    xbotTheaterExtractYouTubeId: win.xbotTheaterExtractYouTubeId,
    xbotTheaterLoadPlaylist: win.xbotTheaterLoadPlaylist,
    xbotTheaterAddToPlaylist: win.xbotTheaterAddToPlaylist,
    xbotTheaterAddToPlaylistFromInput: win.xbotTheaterAddToPlaylistFromInput,
    xbotTheaterRemoveFromPlaylist: win.xbotTheaterRemoveFromPlaylist,
    xbotTheaterWatchSaved: win.xbotTheaterWatchSaved,
  };
}

function mkSession(id, title, status, youtubeEmbedId) {
  return { id: id, title: title, status: status, youtubeEmbedId: youtubeEmbedId };
}

async function main() {
  // ── REGRESSION: the original v174 live-session watch/PIP flow is
  // untouched by this patch. ──
  {
    const sessions = [mkSession('s1', 'Morning Standup', 'active', 'abc123')];
    const sb = makeSandbox(sessions);
    await sb.xbotTheaterRenderList();
    check('[regression] live session still shows in the list', sb.theaterContent.innerHTML.indexOf('Morning Standup') !== -1);
    sb.xbotTheaterWatch('s1');
    check('[regression] watching a live session still renders its youtube embed', sb.theaterContent.innerHTML.indexOf('youtube.com/embed/abc123') !== -1);
    sb.xbotTheaterPopOut();
    check('[regression] popping out a live session still calls the real pflxPipOpen', sb.pipOpenCalls.length === 1 && sb.pipOpenCalls[0] === 'pip-theater');
    check('[regression] popping out a live session still renders into #pip-theater-body', sb.pipTheaterBody.innerHTML.indexOf('youtube.com/embed/abc123') !== -1);
    sb.xbotTheaterStopWatching();
    check('[regression] stop watching still returns to the list', sb.theaterContent.innerHTML.indexOf('youtube.com/embed') === -1);
  }
  {
    const sb = makeSandbox([]);
    sb.xbotTheaterPopOut();
    check('[regression] popping out with nothing watched is still a safe no-op', sb.pipOpenCalls.length === 0 && sb.pipTheaterBody.innerHTML === '');
  }

  // ── xbotTheaterExtractYouTubeId: ported directly from X-Live's own
  // pflxYouTubeExtractId, same cases. ──
  {
    const sb = makeSandbox([]);
    check('a raw 11-char video ID passes through unchanged', sb.xbotTheaterExtractYouTubeId('dQw4w9WgXcQ') === 'dQw4w9WgXcQ');
    check('a youtube.com/watch?v= URL extracts the ID', sb.xbotTheaterExtractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ') === 'dQw4w9WgXcQ');
    check('a youtu.be short-link extracts the ID', sb.xbotTheaterExtractYouTubeId('https://youtu.be/dQw4w9WgXcQ') === 'dQw4w9WgXcQ');
    check('a youtube.com/live/ URL extracts the ID', sb.xbotTheaterExtractYouTubeId('https://www.youtube.com/live/dQw4w9WgXcQ') === 'dQw4w9WgXcQ');
    check('a youtube.com/embed/ URL extracts the ID', sb.xbotTheaterExtractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ') === 'dQw4w9WgXcQ');
    check('garbage input returns null rather than embedding something broken', sb.xbotTheaterExtractYouTubeId('not a youtube link at all') === null);
    check('empty input returns null', sb.xbotTheaterExtractYouTubeId('') === null);
  }

  // ── loadPlaylist / addToPlaylist / removeFromPlaylist: the real
  // pflxXBotLoadCfg/SaveCfg round-trip, same bridge xc-2's Teams uses. ──
  {
    const sb = makeSandbox([]);
    const empty = await sb.xbotTheaterLoadPlaylist();
    check('loadPlaylist with nothing stored returns an empty array', Array.isArray(empty) && empty.length === 0);
  }
  {
    const sb = makeSandbox([]);
    const item = await sb.xbotTheaterAddToPlaylist('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Ep. 1');
    check('addToPlaylist returns the new item with the extracted video ID', item && item.videoId === 'dQw4w9WgXcQ' && item.title === 'Ep. 1');
    check('addToPlaylist persists the item to the real cfg.theaterPlaylist via pflxXBotSaveCfg', sb.getCloudCfg().theaterPlaylist.length === 1 && sb.getCloudCfg().theaterPlaylist[0].videoId === 'dQw4w9WgXcQ');
    const reloaded = await sb.xbotTheaterLoadPlaylist();
    check('a second load sees the persisted item', reloaded.length === 1 && reloaded[0].title === 'Ep. 1');
  }
  {
    const sb = makeSandbox([]);
    const item = await sb.xbotTheaterAddToPlaylist('dQw4w9WgXcQ', '');
    check('addToPlaylist with no title falls back to the video ID as the title', item.title === 'dQw4w9WgXcQ');
  }
  {
    const sb = makeSandbox([]);
    const item = await sb.xbotTheaterAddToPlaylist('not a valid youtube url', 'Bad');
    check('addToPlaylist with unextractable input returns null and writes nothing', item === null && (sb.getCloudCfg().theaterPlaylist || []).length === 0);
  }
  {
    const sb = makeSandbox([]);
    const item = await sb.xbotTheaterAddToPlaylist('dQw4w9WgXcQ', 'Keep Me');
    await sb.xbotTheaterAddToPlaylist('abcdefghijk', 'Remove Me');
    check('two adds both persist', sb.getCloudCfg().theaterPlaylist.length === 2);
    await sb.xbotTheaterRemoveFromPlaylist(sb.getCloudCfg().theaterPlaylist[1].id);
    const after = await sb.xbotTheaterLoadPlaylist();
    check('removeFromPlaylist removes only the targeted item, keeping the other', after.length === 1 && after[0].title === 'Keep Me');
  }

  // ── addToPlaylistFromInput: reads the real DOM input, and re-renders
  // on success vs. flags the input (no crash, no fabricated toast() call
  // to a function that does not exist in this file) on failure. ──
  {
    const sb = makeSandbox([], { inputValue: 'https://youtu.be/dQw4w9WgXcQ' });
    await sb.xbotTheaterRenderList();
    await sb.xbotTheaterAddToPlaylistFromInput();
    check('addToPlaylistFromInput reads the real #xbot-theater-playlist-input value and adds it', sb.getCloudCfg().theaterPlaylist.length === 1 && sb.getCloudCfg().theaterPlaylist[0].videoId === 'dQw4w9WgXcQ');
    check('addToPlaylistFromInput re-renders on success -- the new item shows in the panel', sb.theaterContent.innerHTML.indexOf('SAVED PLAYLIST') !== -1 && sb.theaterContent.innerHTML.indexOf('dQw4w9WgXcQ') !== -1);
  }
  {
    const sb = makeSandbox([], { inputValue: 'complete garbage' });
    await sb.xbotTheaterAddToPlaylistFromInput();
    check('addToPlaylistFromInput on bad input writes nothing to the cloud cfg', (sb.getCloudCfg().theaterPlaylist || []).length === 0);
    check('addToPlaylistFromInput on bad input flags the real input element instead of crashing or calling an undefined toast()', sb.playlistInput.style.borderColor === '#ff0050');
  }

  // ── renderList + render: the SAVED PLAYLIST section renders under
  // the live list, always (even with zero live sessions AND zero saved
  // items -- an honest empty state, not a hidden/missing section). ──
  {
    const sb = makeSandbox([], { initialCfg: { cohorts: [], theaterPlaylist: [{ id: 'p1', videoId: 'zzzzzzzzzzz', title: 'Saved Clip' }] } });
    await sb.xbotTheaterRenderList();
    check('renderList loads the real saved playlist alongside live sessions', sb.theaterContent.innerHTML.indexOf('Saved Clip') !== -1);
    check('the empty-live-list message still shows honestly when nothing is streaming', sb.theaterContent.innerHTML.indexOf('Nothing streaming right now') !== -1);
    check('a saved item offers a real WATCH action wired to xbotTheaterWatchSaved', sb.theaterContent.innerHTML.indexOf("xbotTheaterWatchSaved('p1')") !== -1);
    check('a saved item offers a real REMOVE action wired to xbotTheaterRemoveFromPlaylist', sb.theaterContent.innerHTML.indexOf("xbotTheaterRemoveFromPlaylist('p1')") !== -1);
  }
  {
    const sb = makeSandbox([]);
    await sb.xbotTheaterRenderList();
    check('with zero saved items, an honest "No saved videos yet" message shows -- not a blank/missing section', sb.theaterContent.innerHTML.indexOf('No saved videos yet') !== -1);
    check('the add-video input is always present so a host can add the first one', sb.theaterContent.innerHTML.indexOf('id="xbot-theater-playlist-input"') !== -1);
  }

  // ── xbotTheaterWatchSaved / xbotTheaterRender: a saved item plays
  // through the SAME embed/PIP UI shape a live session uses. ──
  {
    const sb = makeSandbox([], { initialCfg: { cohorts: [], theaterPlaylist: [{ id: 'p1', videoId: 'saved123456', title: 'My Saved Video' }] } });
    await sb.xbotTheaterRenderList();
    sb.xbotTheaterWatchSaved('p1');
    check('watching a saved item renders its real youtube embed', sb.theaterContent.innerHTML.indexOf('youtube.com/embed/saved123456') !== -1);
    check('watching a saved item shows its title', sb.theaterContent.innerHTML.indexOf('My Saved Video') !== -1);
    check('watching a saved item offers the SAME POP OUT action a live session gets', sb.theaterContent.innerHTML.indexOf('xbotTheaterPopOut()') !== -1);
    check('watching a saved item offers the SAME BACK action a live session gets', sb.theaterContent.innerHTML.indexOf('xbotTheaterStopWatching()') !== -1);
  }
  {
    // popping out a saved item must reuse the exact same PIP mechanism.
    const sb = makeSandbox([], { initialCfg: { cohorts: [], theaterPlaylist: [{ id: 'p1', videoId: 'popsaved1234', title: 'Pop Test' }] } });
    await sb.xbotTheaterRenderList();
    sb.xbotTheaterWatchSaved('p1');
    sb.xbotTheaterPopOut();
    check('popping out a saved item renders it into #pip-theater-body', sb.pipTheaterBody.innerHTML.indexOf('youtube.com/embed/popsaved1234') !== -1);
    check('popping out a saved item calls the REAL generic pflxPipOpen -- same shared PIP framework', sb.pipOpenCalls.length === 1 && sb.pipOpenCalls[0] === 'pip-theater');
  }
  {
    // stopping/removing while watching a saved item cleans up watchingId
    // correctly (no dangling 'saved:' id pointing at a deleted entry).
    const sb = makeSandbox([], { initialCfg: { cohorts: [], theaterPlaylist: [{ id: 'p1', videoId: 'removeme1234', title: 'Will Be Removed' }] } });
    await sb.xbotTheaterRenderList();
    sb.xbotTheaterWatchSaved('p1');
    await sb.xbotTheaterRemoveFromPlaylist('p1');
    check('removing the item currently being watched falls back to the list, not a stale/broken embed', sb.theaterContent.innerHTML.indexOf('youtube.com/embed') === -1);
  }
  {
    // watching a saved item whose id no longer exists in the cache
    // (stale reference) falls back safely instead of crashing.
    const sb = makeSandbox([], { initialCfg: { cohorts: [], theaterPlaylist: [] } });
    await sb.xbotTheaterRenderList();
    sb.xbotTheaterWatchSaved('does-not-exist');
    check('watching a nonexistent saved id falls back to the list instead of crashing', sb.theaterContent.innerHTML.indexOf('SAVED PLAYLIST') !== -1);
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
