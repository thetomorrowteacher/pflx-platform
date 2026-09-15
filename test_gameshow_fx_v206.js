// PATCH PLATFORM v206 -- gameshow countdown FX + relay. Extracts the REAL
// shipped v206 <script> block from preview.html and runs it in a vm with
// stubbed browser + Supabase (nothing touches the network).
const fs = require('fs'); const vm = require('vm');
const src = fs.readFileSync(process.argv[2], 'utf8');
let pass = 0, fail = 0;
function check(l, c, x) { if (c) { pass++; console.log('PASS: ' + l); } else { fail++; console.log('FAIL: ' + l + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } }
const a = src.indexOf('    // ═══ PATCH PLATFORM v206 -- Gameshow countdown FX');
const b = src.indexOf('    // ═══ /PATCH PLATFORM v206 ═══');
check('v206 block present', a > 0 && b > a);
check('PFLX_PATCH is at least 206', +((src.match(/window\.PFLX_PATCH\s+=\s+(\d+);/) || [])[1]) >= 206);
const block = src.slice(a, b);
check('engine is embedded in the block', block.indexOf('root.PflxFx = {') !== -1);
check('countdown sounds come from /public/sounds/countdown/', block.indexOf("c10: 'countdown/count_10.mp3'") !== -1 && block.indexOf("soundRoot: '/public/sounds/'") !== -1);

function sandbox(opts) {
  opts = opts || {};
  const listeners = {};
  const store = { pflx_live_fx: opts.fx ? { events: opts.fx } : null };
  const writes = [];
  const channels = [];
  const client = {
    from() {
      const q = { _key: null,
        select() { return q; }, eq(k, v) { q._key = v; return q; },
        maybeSingle: async () => ({ data: store[q._key] ? { data: store[q._key] } : null }),
        upsert: async (row) => { writes.push(row); store[row.key] = row.data; return {}; } };
      return q;
    },
    channel(name) { const ch = { name, subs: [], on(ev, f, cb) { ch.subs.push({ f, cb }); return ch; }, subscribe() { channels.push(ch); return ch; } }; return ch; }
  };
  const started = [], cancelled = [], shows = [];
  const w = {
    activeSession: opts.session === undefined ? { id: 'h1', role: 'Host', cohorts: ['A'] } : opts.session,
    location: { origin: 'https://www.prototypeflx.com' },
    pflxSupabase: () => client,
    pflxIsHostRole: (r) => /host|admin|instructor|teacher/i.test(String(r || '')),
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    matchMedia: () => ({ matches: false }),
    PFLX_AUDIO: { duckLevels: {}, stack: [], start(s) { this.stack.push(s); }, stop(s) { this.stack = this.stack.filter(x => x !== s); } }
  };
  w.window = w;
  const ctx = { window: w, document: { querySelectorAll: () => [], getElementById: () => null }, setTimeout: (f, ms) => { if (ms <= 150) f(); return 1; }, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, console, Date, JSON, Math, Promise, Object, Array, String, Number, isFinite, parseInt };
  vm.createContext(ctx);
  vm.runInContext(block, ctx);
  // stub the engine calls after load so relay behaviour is observable
  w.PflxFx.startCountdown = (o) => { started.push(o); return true; };
  w.PflxFx.cancel = (id) => { cancelled.push(id); return true; };
  w.PflxFx.playShow = (n) => { shows.push(n); return true; };
  return { w, ctx, store, writes, channels, started, cancelled, shows, listeners };
}
(async () => {
  const S = sandbox();
  const w = S.w;
  // scope
  const viewer = { id: 'p1', role: 'student', cohorts: ['A'] };
  check('scope: no cohorts = everyone', w.pflxFxInScope({ cohorts: [] }, viewer));
  check('scope: shared cohort', w.pflxFxInScope({ cohorts: ['B', 'A'] }, viewer));
  check('scope: other cohort is filtered out', !w.pflxFxInScope({ cohorts: ['B'] }, viewer));
  check('scope: sender always', w.pflxFxInScope({ cohorts: ['B'], by: 'p1' }, viewer));
  check('scope: master host sees every class', w.pflxFxInScope({ cohorts: ['B'] }, { id: 'm', role: 'master host', cohorts: [] }));
  check('scope: not signed in -> nothing', !w.pflxFxInScope({ cohorts: [] }, null));
  // merge
  const now = Date.now();
  const merged = w.pflxFxMergeEvents([{ id: 'x', at: now }], [{ id: 'old', at: now - 11 * 60000 }, { id: 'y', at: now - 1000 }], now);
  check('merge: union by id, too-old dropped, sorted by time', merged.map(e => e.id).join(',') === 'y,x', merged);
  const many = []; for (let i = 0; i < 30; i++) many.push({ id: 'e' + i, at: now - 30000 + i });
  check('merge: keeps the newest 20', w.pflxFxMergeEvents([], many, now).length === 20 && w.pflxFxMergeEvents([], many, now)[0].id === 'e10');
  // origins
  check('origin: own site ok', w.pflxFxOriginOk('https://www.prototypeflx.com'));
  check('origin: X-Live pages ok', w.pflxFxOriginOk('https://thetomorrowteacher.github.io'));
  check('origin: localhost ok', w.pflxFxOriginOk('http://localhost:8766'));
  check('origin: anything else refused', !w.pflxFxOriginOk('https://evil.example') && !w.pflxFxOriginOk('https://thetomorrowteacher.github.io.evil.com'));
  check('host can broadcast; player cannot', w.pflxFxCanBroadcast() && !sandbox({ session: { id: 'p', role: 'Student' } }).w.pflxFxCanBroadcast());
  // host countdown -> relay write
  w.pflxLiveFx.countdown({ id: 'cd1', endsAt: now + 30000, label: 'Timer', broadcast: true, cohorts: ['A'] });
  await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
  check('host countdown ran locally', S.started.some(o => o.id === 'cd1'));
  const row = S.writes[S.writes.length - 1];
  const ev = row && row.data.events.find(e => e.kind === 'countdown');
  check('relay row written to pflx_live_fx', row && row.key === 'pflx_live_fx' && !!ev, row);
  check('event carries cdId/endsAt/sentAt/cohorts/by', ev && ev.cdId === 'cd1' && ev.endsAt === now + 30000 && ev.sentAt > 0 && ev.cohorts[0] === 'A' && ev.by === 'h1', ev);
  // host's own echo not replayed
  S.started.length = 0;
  w.pflxFxHandleRelay(row.data.events, Date.now());
  check('host ignores its own echo', S.started.length === 0);
  // player receives -> re-based on its own clock
  const P = sandbox({ session: { id: 'p1', role: 'Student', cohorts: ['A'] } });
  const sent = { id: 'evX', kind: 'countdown', cdId: 'cdX', endsAt: 1000 + 25000, sentAt: 1000, at: 1000, cohorts: ['A'], by: 'h1' };
  const recv = Date.now();
  P.w.pflxFxHandleRelay([sent], recv);
  const got = P.started[0];
  check('player starts the countdown re-based on its own clock (25s from receipt)', got && got.id === 'cdX' && Math.abs(got.endsAt - (recv + 25000 - 150)) < 5, got);
  P.w.pflxFxHandleRelay([sent], recv);
  check('same event never runs twice', P.started.length === 1);
  P.w.pflxFxHandleRelay([{ id: 'evY', kind: 'countdown', cdId: 'cdY', endsAt: 99999, sentAt: 1, at: 2000, cohorts: ['Z'] }], recv);
  check('out-of-cohort countdown ignored', P.started.length === 1);
  P.w.pflxFxHandleRelay([{ id: 'old1', kind: 'show', fx: 'win', at: 1000 }, { id: 'new1', kind: 'show', fx: 'boom', at: 60000 }], recv);
  check('only the fresh burst plays (old tail skipped)', P.shows.join() === 'boom', P.shows);
  P.w.pflxFxHandleRelay([{ id: 'c1', kind: 'cancel', cdId: 'cdX', at: 70000 }], recv);
  check('cancel event stops the countdown', P.cancelled.indexOf('cdX') !== -1);
  const N = sandbox({ session: null });
  N.w.pflxFxHandleRelay([{ id: 'q', kind: 'show', fx: 'win', at: 1 }], recv);
  check('signed-out window plays nothing', N.shows.length === 0);
  // postMessage routing
  const M = sandbox({ session: { id: 'p9', role: 'Student', cohorts: [] } });
  const onMsg = M.listeners.message.find(Boolean);
  const before = M.writes.length;
  onMsg({ origin: 'https://thetomorrowteacher.github.io', data: JSON.stringify({ type: 'pflx_countdown', action: 'start', id: 'z1', endsAt: Date.now() + 9000, broadcast: true }) });
  await new Promise(r => setImmediate(r));
  check('sub-app countdown runs locally', M.started.some(o => o.id === 'z1'));
  check('a player cannot broadcast through a sub-app', M.writes.length === before);
  onMsg({ origin: 'https://evil.example', data: JSON.stringify({ type: 'pflx_show_fx', fx: 'win' }) });
  check('foreign origin ignored', M.shows.length === 0);
  onMsg({ origin: 'https://thetomorrowteacher.github.io', data: JSON.stringify({ type: 'pflx_show_fx', fx: 'win', eventId: 'fx1' }) });
  onMsg({ origin: 'https://thetomorrowteacher.github.io', data: JSON.stringify({ type: 'pflx_show_fx', fx: 'win', eventId: 'fx1' }) });
  check('show FX dedupes by event id', M.shows.length === 1);
  onMsg({ origin: 'https://thetomorrowteacher.github.io', data: JSON.stringify({ type: 'pflx_countdown', action: 'start', id: 'z1', endsAt: Date.now() + 5000, soft: true }) });
  check('soft flag is passed through for re-announcements', M.started[M.started.length - 1].soft === true);
  // realtime boot subscribed to the relay AND sessions
  await new Promise(r => setImmediate(r));
  const ch = S.channels.find(c => c.name === 'pflx-live-fx');
  check('realtime channel subscribes to pflx_live_fx and sessions', ch && ch.subs.some(s => s.f.filter === 'key=eq.pflx_live_fx') && ch.subs.some(s => s.f.filter === 'key=eq.sessions'));
  // BGM ducking helper
  const bg = { volume: 0.6 };
  S.ctx.SE = { bgAudio: bg, playerPrefs: {} };
  vm.runInContext('var SE = this.SE;', S.ctx);
  w.pflxBgmDuck('countdown', true, 0.25);
  check('BGM ducked to 25%', Math.abs(bg.volume - 0.15) < 1e-9, bg.volume);
  w.pflxBgmDuck('countdown', false);
  check('BGM restored', Math.abs(bg.volume - 0.6) < 1e-9, bg.volume);
  w.pflxBgmDuck('x', true, 0.5); bg.volume = 0.9; w.pflxBgmDuck('x', false);
  check('a volume the player changed while ducked is kept', bg.volume === 0.9, bg.volume);
  // Cyber Timer integration (real extracted functions)
  const t0 = src.indexOf('        function pflxXbotTimerFxSync(restart) {');
  const t1 = src.indexOf('window.pflxXbotTimerFxSync = pflxXbotTimerFxSync;', t0);
  const calls = [];
  const tctx = { window: { pflxLiveFx: { countdown: o => calls.push(['start', o]), cancel: o => calls.push(['cancel', o]) }, _xbotLiveCfg: { cohorts: ['A'] } }, xbotTimer: { running: true, paused: false, remainingSeconds: 60, soundOn: false, fxId: null }, Date };
  vm.createContext(tctx);
  vm.runInContext(src.slice(t0, t1) + '\nthis.sync = pflxXbotTimerFxSync;', tctx);
  tctx.sync(true);
  check('timer start broadcasts a countdown to the class cohorts', calls[0][0] === 'start' && calls[0][1].broadcast && calls[0][1].cohorts[0] === 'A' && calls[0][1].silent === true, calls);
  const id1 = tctx.xbotTimer.fxId;
  tctx.xbotTimer.paused = true; tctx.sync(false);
  check('pause cancels it for everyone', calls[1][0] === 'cancel' && calls[1][1].id === id1 && tctx.xbotTimer.fxId === null);
  tctx.xbotTimer.paused = false; tctx.sync(false);
  check('resume starts a fresh countdown id', calls[2][0] === 'start' && calls[2][1].id !== id1);
  tctx.xbotTimer.running = false; tctx.sync(false);
  check('stop cancels', calls[3][0] === 'cancel');
  check('speech + alarm defer to the engine only while it runs', src.indexOf("if (xbotTimer.fxId && window.PflxFx) return; // v206 -- the countdown engine's voice counts instead") !== -1 && src.indexOf("if (xbotTimer.fxId && window.PflxFx) return; // v206 -- the countdown engine plays the drop + alarm") !== -1);
  check('X-Live iframe may autoplay', src.indexOf('allow="fullscreen; clipboard-write; clipboard-read; autoplay"') !== -1);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
