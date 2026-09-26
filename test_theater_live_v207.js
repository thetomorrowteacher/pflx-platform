// PATCH PLATFORM v207 -- Live Theater for everyone, playlist editor, all
// sources, loading-screen fade. Runs the REAL v207 <script> block from
// preview.html in a vm with in-memory Supabase/cfg (no network).
const fs = require('fs'); const vm = require('vm');
const src = fs.readFileSync(process.argv[2], 'utf8');
let pass = 0, fail = 0;
function check(l, c, x) { if (c) { pass++; console.log('PASS: ' + l); } else { fail++; console.log('FAIL: ' + l + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } }
const a = src.indexOf('    // ═══ PATCH PLATFORM v207 -- Live Theater');
const b = src.indexOf('    // ═══ /PATCH PLATFORM v207 ═══');
check('v207 block present', a > 0 && b > a);
const block = src.slice(a, b);
const tick = () => new Promise(r => setImmediate(r));

function sandbox(role) {
  const store = { pflx_theater_live: null };
  let cfg = { cohorts: ['A'], theaterPlaylists: [{ id: 'pl1', name: 'Mix', items: [
    { id: 'i1', videoId: 'aaaaaaaaaaa', title: 'One', durationSec: 60 },
    { id: 'i2', source: 'gdrive', ref: 'DRIVEFILEID123', title: 'Two', durationSec: null },
    { id: 'i3', source: 'tiktok', ref: '7234567890123', title: 'Three' }] }, { id: 'pl2', name: 'Other', items: [] }], theaterBroadcast: null };
  const writes = [];
  const client = {
    from() { const q = { k: null, select() { return q; }, eq(_, v) { q.k = v; return q; },
      maybeSingle: async () => ({ data: store[q.k] ? { data: JSON.parse(JSON.stringify(store[q.k])) } : null }),
      upsert: async (row) => { writes.push(row); store[row.key] = JSON.parse(JSON.stringify(row.data)); return {}; } }; return q; },
    channel() { const ch = { on() { return ch; }, subscribe() { return ch; } }; return ch; },
    storage: { from() { return { upload: async () => ({}), getPublicUrl: (p) => ({ data: { publicUrl: 'https://cdn/' + p } }) }; } }
  };
  const calls = { v203start: [], pip: [] };
  const posted = [];
  const w = {
    activeSession: { id: role === 'host' ? 'h1' : 'p1', role: role === 'host' ? 'Host' : 'Student', cohorts: ['A'] },
    location: { origin: 'https://www.prototypeflx.com' },
    pflxSupabase: () => client,
    pflxFxCanBroadcast: () => role === 'host',
    pflxFxInScope: (ev, v) => !ev.cohorts || !ev.cohorts.length || ev.cohorts.some(c => v.cohorts.indexOf(c) !== -1),
    pflxXBotLoadCfg: async () => JSON.parse(JSON.stringify(cfg)),
    pflxXBotSaveCfg: async (c) => { cfg = JSON.parse(JSON.stringify(c)); },
    _xbotLiveCfg: null, _xbotTheaterPlaylistsCache: cfg.theaterPlaylists, _xbotTheaterSelectedPlaylistId: 'pl1',
    xbotTheaterFindPlaylistItem: (id) => { for (const p of cfg.theaterPlaylists) for (const it of p.items) if (it.id === id) return it; return null; },
    xbotTheaterStartBroadcast: async (id) => { calls.v203start.push(id); },
    xbotTheaterPopOut: () => 'v203pop', xbotTheaterPopIn: () => 'v203in', xbotTheaterRender: () => 'v203render',
    pflxXBotAutoStartTheaterOnLogin: () => { calls.auto = true; },
    pflxPipIsOpen: () => false, pflxPipOpen: (id) => calls.pip.push(id), pflxPipClose: () => {},
    addEventListener() {},
    fetch: async (u) => ({ ok: true, json: async () => ({ title: 'Fetched ' + (u.indexOf('tiktok') !== -1 ? 'TikTok' : 'YT'), thumbnail_url: 'https://thumb' }) }),
    PFLX_AUDIO: { stack: [], duckLevels: { loading: 20 }, liveFeedBase: 100, _lastApplied: -1, start(s) { this.stack.push(s); this.apply(); }, stop(s) { this.stack = this.stack.filter(x => x !== s); this.apply(); } }
  };
  w.window = w;
  const doc = { els: {}, getElementById(id) { return this.els[id] || null; }, querySelectorAll() { return doc.media || []; }, querySelector() { return null; }, createElement() { return { style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, appendChild() {}, setAttribute() {}, querySelector(sel) { return sel === 'em' ? { scrollWidth: 100, clientWidth: 100, classList: { add() {}, remove() {}, contains() { return false; } }, style: { setProperty() {} }, innerHTML: '' } : null; } }; }, head: { appendChild() {} }, body: { appendChild() {} }, activeElement: null };
  const ctx = { window: w, document: doc, fetch: w.fetch, setTimeout: (f) => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, console, Date, JSON, Math, Promise, Object, Array, String, Number, isFinite, isNaN, parseInt, encodeURIComponent };
  vm.createContext(ctx);
  vm.runInContext(block, ctx);
  return { w, store, writes, calls, doc, getCfg: () => cfg, ctx };
}
(async () => {
  const H = sandbox('host');
  const w = H.w;
  await tick(); await tick();
  const P = w.pflxTheaterParseMedia;
  const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  check('parse: YouTube watch link', eq(P('https://www.youtube.com/watch?v=En5x-n4slRY&t=4'), { source: 'youtube', videoId: 'En5x-n4slRY' }));
  check('parse: bare id', eq(P('6V4yOAX69h4'), { source: 'youtube', videoId: '6V4yOAX69h4' }));
  check('parse: youtu.be', P('https://youtu.be/6V4yOAX69h4?si=x').videoId === '6V4yOAX69h4');
  check('parse: Shorts', eq(P('https://youtube.com/shorts/abcDEF12345?feature=share'), { source: 'shorts', videoId: 'abcDEF12345' }));
  check('parse: YouTube playlist page', eq(P('https://www.youtube.com/playlist?list=PLabcdefghij123'), { source: 'ytplaylist', playlistId: 'PLabcdefghij123' }));
  check('parse: a video inside a playlist stays one video', P('https://www.youtube.com/watch?v=En5x-n4slRY&list=PLabcdefghij123').source === 'youtube');
  check('parse: Google Drive share link', eq(P('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing'), { source: 'gdrive', ref: '1AbCdEfGhIjKlMnOp' }));
  check('parse: Drive open?id=', P('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp').ref === '1AbCdEfGhIjKlMnOp');
  check('parse: TikTok video', eq(P('https://www.tiktok.com/@pflx/video/7234567890123456789?lang=en'), { source: 'tiktok', ref: '7234567890123456789' }));
  check('parse: TikTok short link is flagged, not guessed', P('https://vm.tiktok.com/ZMabc/').source === 'tiktok-short-link');
  check('parse: direct video file', eq(P('https://cdn.example.com/clip.mp4?x=1'), { source: 'file', ref: 'https://cdn.example.com/clip.mp4?x=1' }));
  check('parse: junk -> null', P('hello world') === null && P('https://example.com/page') === null && P('') === null);
  const U = w.pflxTheaterMediaUrl;
  check('drive plays direct first, preview as fallback', U({ source: 'gdrive', ref: 'X1' }) === 'https://drive.google.com/uc?export=download&id=X1' && U({ source: 'gdrive', ref: 'X1' }, 'iframe') === 'https://drive.google.com/file/d/X1/preview');
  check('tiktok uses the embed player', U({ source: 'tiktok', ref: '99' }).indexOf('https://www.tiktok.com/player/v1/99?') === 0);
  check('youtube thumb', w.pflxTheaterItemThumb({ videoId: 'abc' }).indexOf('i.ytimg.com/vi/abc/') !== -1);
  const M = w.pflxTheaterMoveItem;
  const L3 = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  check('move: to front', M(L3, 'c', 0).map(x => x.id).join('') === 'cab');
  check('move: to end', M(L3, 'a', 9).map(x => x.id).join('') === 'bca');
  check('move: unknown id leaves order', M(L3, 'z', 0).map(x => x.id).join('') === 'abc' && L3.map(x => x.id).join('') === 'abc');
  const st = { active: true, playlist: [1, 2, 3], index: 2, loop: 'none' };
  check('next: loop off ends after the last video', w.pflxTheaterLiveNext(st).end === true);
  check('next: loop all wraps to the first', w.pflxTheaterLiveNext(Object.assign({}, st, { loop: 'all' })).index === 0);
  check('next: loop one repeats the same video', w.pflxTheaterLiveNext(Object.assign({}, st, { loop: 'one' })).index === 2);
  check('next: manual skip still moves with loop one', w.pflxTheaterLiveNext(Object.assign({}, st, { loop: 'one', index: 0 }), 0, 1).index === 1);
  check('prev at the start with loop all wraps to the end', w.pflxTheaterLiveNext(Object.assign({}, st, { loop: 'all', index: 0 }), 0, -1).index === 2);
  const pos = w.pflxTheaterLivePosition({ active: true, playlist: [{ id: 'x' }], index: 0, startedAt: 10000 }, 40000, 2000);
  check('position = (now - skew - startedAt)', pos.pos === 28, pos);
  check('paused position is frozen', w.pflxTheaterLivePosition({ active: true, playlist: [{}], index: 0, paused: true, pausedPos: 12.5 }, 99999, 0).pos === 12.5);
  // editor
  let r = await w.pflxTheaterAddFromText('pl1', 'https://youtube.com/shorts/abcDEF12345');
  check('add a Short: fetched title, source kept', r.ok && r.item.source === 'shorts' && r.item.title === 'Fetched YT' && H.getCfg().theaterPlaylists[0].items.length === 4, r);
  r = await w.pflxTheaterAddFromText('pl1', 'https://www.tiktok.com/@a/video/7234567890123456789');
  check('add a TikTok: title + thumbnail from TikTok oEmbed', r.ok && r.item.title === 'Fetched TikTok' && r.item.thumb === 'https://thumb');
  r = await w.pflxTheaterAddFromText('pl1', 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view');
  check('add a Drive video', r.ok && r.item.source === 'gdrive' && r.item.title === 'Google Drive video');
  r = await w.pflxTheaterAddFromText('pl1', 'not a link');
  check('bad link returns a readable error, nothing saved', !r.ok && /YouTube, Shorts, Google Drive, TikTok/.test(r.error) && H.getCfg().theaterPlaylists[0].items.length === 6);
  await w.pflxTheaterRenameItem('pl1', 'i1', '  Opening Video  ');
  check('rename an item', H.getCfg().theaterPlaylists[0].items[0].title === 'Opening Video');
  await w.pflxTheaterSetItemDuration('pl1', 'i2', '3:20');
  check('set a length as m:ss', H.getCfg().theaterPlaylists[0].items[1].durationSec === 200);
  await w.pflxTheaterSetItemDuration('pl1', 'i2', '');
  check('clearing the length stores null', H.getCfg().theaterPlaylists[0].items[1].durationSec === null);
  await w.pflxTheaterMoveItemTo('pl1', 'i3', 0);
  check('drag-reorder persists', H.getCfg().theaterPlaylists[0].items[0].id === 'i3');
  w._xbotTheaterPlaylistsCache = H.getCfg().theaterPlaylists;
  await w.pflxTheaterNudgeItem('pl1', 'i3', 1);
  check('move down button', H.getCfg().theaterPlaylists[0].items[1].id === 'i3');
  w._xbotTheaterPlaylistsCache = H.getCfg().theaterPlaylists;
  await w.pflxTheaterCopyItemTo('pl1', 'i1', 'pl2');
  const copied = H.getCfg().theaterPlaylists[1].items[0];
  check('copy to another playlist (new id)', copied && copied.videoId === 'aaaaaaaaaaa' && copied.id !== 'i1');
  const n = await w.pflxTheaterUploadFiles('pl2', [{ name: 'My Clip!.mp4', type: 'video/mp4', size: 1000 }, { name: 'huge.mp4', type: 'video/mp4', size: 60 * 1024 * 1024 }, { name: 'a.png', type: 'image/png', size: 5 }]);
  const up = H.getCfg().theaterPlaylists[1].items.filter(x => x.source === 'file');
  check('file upload: video only, 50 MB cap, public URL stored', n === 1 && up.length === 1 && up[0].ref.indexOf('https://cdn/h1/') === 0 && up[0].title === 'My Clip!', up);
  // live control
  w._xbotTheaterPlaylistsCache = H.getCfg().theaterPlaylists;
  await w.xbotTheaterStartBroadcast('pl1');
  let live = H.store.pflx_theater_live;
  check('STREAM TO EVERYONE writes the live record (loop all, whole playlist)', live && live.active && live.playlistId === 'pl1' && live.loop === 'all' && live.playlist.length === 6 && live.rev === 1 && live.by === 'h1', live);
  check('v203 pointer still written', H.calls.v203start[0] === 'pl1');
  check('audience = the class cohorts', live.cohorts && live.cohorts[0] === 'A');
  check('items keep their source', live.playlist.some(x => x.source === 'tiktok') && live.playlist.some(x => x.source === 'gdrive'));
  await w.pflxTheaterLiveTogglePause();
  live = H.store.pflx_theater_live;
  check('pause stores the frozen position', live.paused === true && live.pausedPos >= 0 && live.rev === 2);
  await w.pflxTheaterLiveTogglePause();
  check('resume re-bases startedAt', H.store.pflx_theater_live.paused === false && H.store.pflx_theater_live.startedAt <= Date.now());
  await w.pflxTheaterLiveSkip(1);
  check('skip moves to the next video', H.store.pflx_theater_live.index === 1);
  await w.pflxTheaterLiveJump(4);
  check('jump to a row', H.store.pflx_theater_live.index === 4);
  await w.pflxTheaterLiveCycleLoop();
  check('loop cycles all -> one', H.store.pflx_theater_live.loop === 'one');
  await w.pflxTheaterLiveSetLoop('bogus');
  check('bad loop mode ignored', H.store.pflx_theater_live.loop === 'one');
  await w.pflxTheaterLivePlayFrom('pl1', 'i1');
  check('📡 on a row starts from that row, keeping the loop mode', H.store.pflx_theater_live.index === H.getCfg().theaterPlaylists[0].items.findIndex(x => x.id === 'i1') && H.store.pflx_theater_live.loop === 'one');
  const cfgBefore = H.getCfg(); cfgBefore.theaterBroadcast = { playlistId: 'pl1', startedAt: 1 };
  await w.pflxTheaterLiveStop();
  check('stop ends it for everyone and clears the v203 pointer', H.store.pflx_theater_live.active === false && H.getCfg().theaterBroadcast === null);
  // players cannot write
  const Pl = sandbox('player');
  await tick();
  const w0 = Pl.writes.length;
  await Pl.w.pflxTheaterLivePlay([{ videoId: 'aaaaaaaaaaa' }], 0);
  await Pl.w.pflxTheaterLiveStop();
  check('players cannot control the stream', Pl.writes.length === w0);
  // viewer: scope + chip
  Pl.w.pflxTheaterLiveApply({ id: 'thX', active: true, playlist: [{ id: 'q', source: 'youtube', videoId: 'aaaaaaaaaaa', title: 'T' }], index: 0, startedAt: Date.now(), cohorts: ['A'], rev: 1 }, 0);
  check('player in the class: stream is active for them', Pl.w.pflxTheaterLiveIsActive());
  Pl.w.pflxTheaterLiveApply({ id: 'thY', active: true, playlist: [{ id: 'q', videoId: 'aaaaaaaaaaa' }], index: 0, startedAt: Date.now(), cohorts: ['Other'], rev: 2 }, 0);
  check('player outside the audience: not active', !Pl.w.pflxTheaterLiveIsActive());
  // overrides
  check('Theater render is the v207 panel', w.xbotTheaterRender !== undefined && w.xbotTheaterRender.toString().indexOf('deckHtml()') !== -1);
  check('WATCH on the v203 stream opens the synced pop-out', w.xbotTheaterWatchBroadcast.toString().indexOf('pflxTheaterLiveOpenPip') !== -1);
  check('pop-out close leaves a reopen chip', w.xbotTheaterPopIn.toString().indexOf('pflxTheaterLiveDismiss') !== -1);
  // PFLX_AUDIO fade: every Theater player, including <video>
  const A = w.PFLX_AUDIO;
  const video = { tagName: 'VIDEO', volume: 1, muted: false };
  const msgs = [];
  const yt = { tagName: 'IFRAME', src: 'https://www.youtube.com/embed/x?enablejsapi=1', contentWindow: { postMessage: (m) => msgs.push(m) }, addEventListener() {} };
  H.doc.media = [video, yt];
  const ticks = [];
  H.ctx.setInterval = (f) => { ticks.push(f); return 7; };
  vm.runInContext('setInterval = this.setInterval;', H.ctx);
  A.refresh();
  check('fade targets include video elements and YouTube iframes', A._targets().length === 2);
  A.start('loading');
  while (ticks.length) { const f = ticks.shift(); for (let i = 0; i < 40; i++) f(); }
  check('loading screen fades the video to muted', video.volume === 0 && video.muted === true, video);
  check('YouTube players get setVolume 0 + mute', msgs.some(m => m.indexOf('"setVolume","args":[0]') !== -1) && msgs.some(m => m.indexOf('"func":"mute"') !== -1));
  A.stop('loading');
  while (ticks.length) { const f = ticks.shift(); for (let i = 0; i < 40; i++) f(); }
  check('after the loading screen it fades back to full', video.volume === 1 && video.muted === false, video);
  check('loading duck level is full mute', A.duckLevels.loading === 0);
  check('every loading screen starts the fade (2 show paths)', (src.match(/window\.PFLX_AUDIO\.start\('loading'\); \} catch \(e\) \{\} \/\/ v207/g) || []).length === 2);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
