// PATCH v216 -- changed-only pull + shared realtime feed + reward delivery (static + sandbox checks)
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let pass = 0, fail = 0;
function check(l, c, x) { if (c) { pass++; console.log('PASS: ' + l); } else { fail++; console.log('FAIL: ' + l + (x !== undefined ? '  [' + JSON.stringify(x) + ']' : '')); } }
function between(a, b) { const i = src.indexOf(a); if (i < 0) throw new Error('missing ' + a); const j = src.indexOf(b, i); if (j < 0) throw new Error('missing end ' + b); return src.slice(i, j); }
check('PFLX_PATCH is 216+', /window\.PFLX_PATCH\s*=\s*(\d+)/.test(src) && +src.match(/window\.PFLX_PATCH\s*=\s*(\d+)/)[1] >= 216);
const mod = between('        window.pflxAppDataFeed = (function () {', '        window._mcFetchChangedRows = _mcFetchChangedRows;');
// sandbox with a fake client
function makeClient(rows, log) {
  function Q() { this.f = []; }
  Q.prototype.select = function (c) { this.cols = c; return this; };
  Q.prototype.or = function (s) { this.f.push(['or', s]); return this; };
  Q.prototype.in = function (c, v) { this.f.push(['in', v]); return this; };
  Q.prototype.limit = function () { return this; };
  Q.prototype.then = function (res) {
    let out = rows.slice();
    this.f.forEach(f => { if (f[0] === 'in') out = out.filter(r => f[1].indexOf(r.key) >= 0); });
    log.push({ cols: this.cols, keys: out.map(r => r.key) });
    const cols = this.cols.split(',').map(s => s.trim());
    return Promise.resolve({ data: out.map(r => { const o = {}; cols.forEach(c => o[c] = r[c]); return o; }), error: null }).then(res);
  };
  const bindings = [];
  return { from: () => new Q(), bindings,
    channel: (name) => { const ch = { name, on: (t, f, cb) => { bindings.push({ name, t, f, cb }); return ch; }, subscribe: (cb) => { setTimeout(() => cb && cb('SUBSCRIBED'), 0); return ch; } }; return ch; } };
}
(async () => {
  const rows = [
    { key: 'pflx_mc_tasks', data: { items: [1] }, updated_at: '2026-09-16T05:00:00.100001+00:00' },
    { key: 'pflx_mc_players', data: { items: [2] }, updated_at: '2026-09-16T05:00:00.100002+00:00' },
    { key: 'coinCategories', data: [], updated_at: '2026-09-16T05:00:00.100003+00:00' },
    { key: 'pflx_player_tombstones', data: {}, updated_at: '2026-09-16T05:00:00.100004+00:00' }];
  const log = [];
  const client = makeClient(rows, log);
  const sb = { window: {}, console: { log() {}, warn() {} }, _mcCloudPulledOnce: false };
  sb.window.pflxSupabase = () => client;
  const run = new Function('sb', 'with (sb) {\n' + mod + '\nsb.fetch = _mcFetchChangedRows; sb.stamp = pflxStampKey; sb.seen = _mcRowSeen;\n}');
  run(sb);
  check('stamp: REST and realtime formats agree', sb.stamp('2026-09-16T05:02:44.873129+00:00') === sb.stamp('2026-09-16 05:02:44.873129+00'), [sb.stamp('2026-09-16T05:02:44.873129+00:00'), sb.stamp('2026-09-16 05:02:44.873129+00')]);
  check('stamp: microseconds matter', sb.stamp('2026-09-16T05:02:44.873129+00:00') !== sb.stamp('2026-09-16T05:02:44.873130+00:00'));
  let r = await sb.fetch(client);
  check('boot: full pull with data, side keys split out', r.full && r.data.length === 2 && r.side.coinCategories && r.side.pflx_player_tombstones && /data/.test(log[0].cols), r);
  sb._mcCloudPulledOnce = true;
  log.length = 0;
  r = await sb.fetch(client);
  check('tick: nothing changed -> one stamps query, no data', log.length === 1 && log[0].cols === 'key, updated_at' && r.data.length === 0, log);
  rows[0].updated_at = '2026-09-16T05:01:00.000001+00:00';
  rows[2].updated_at = '2026-09-16T05:01:00.000002+00:00';
  log.length = 0;
  r = await sb.fetch(client);
  check('tick: only changed rows downloaded', log.length === 2 && JSON.stringify(log[1].keys) === '["pflx_mc_tasks","coinCategories"]' && r.data.length === 1 && r.side.coinCategories && !r.side.pflx_player_tombstones, log);
  sb.window.pflxRowSeen('pflx_mc_players', '2026-09-16 05:00:00.100002+00');
  rows[1].updated_at = '2026-09-16T05:00:00.100002+00:00';
  log.length = 0;
  await sb.fetch(client);
  check('a copy applied from realtime is not downloaded again', log.length === 1, log);
  for (let i = 0; i < 5; i++) await sb.fetch(client);   // ticks 5-9; tick 10 is full
  log.length = 0;
  r = await sb.fetch(client);
  check('every 10th tick is a full safety pull', r.full === true && /data/.test(log[0].cols), log);
  // shared feed: one channel, many handlers
  const got = [];
  sb.window.pflxAppDataFeed('a', p => got.push('a' + p.n));
  sb.window.pflxAppDataFeed('b', p => got.push('b' + p.n));
  check('feed: one postgres binding for two listeners', client.bindings.length === 1 && client.bindings[0].name === 'pflx-app-data', client.bindings.map(b => b.name));
  client.bindings[0].cb({ n: 1 });
  check('feed: every listener gets each change once', got.join() === 'a1,b1', got);
  sb.window.pflxAppDataFeed('c', () => { throw new Error('boom'); });
  client.bindings[0].cb({ n: 2 });
  check('feed: a failing listener does not block the others', got.join() === 'a1,b1,a2,b2', got);
  // static wiring
  check('MC + roster listeners use the shared feed', src.indexOf("window.pflxAppDataFeed('pflx-mc'") > 0 && src.indexOf("window.pflxAppDataFeed('pflx-roster'") > 0 && src.indexOf(".channel('pflx-mc')") < 0 && src.indexOf(".channel('pflx-roster')") < 0);
  check('pull uses changed-only fetch; side keys not re-queried', src.indexOf('var res = await _mcFetchChangedRows(client);') > 0 && src.indexOf(".eq('key', 'coinCategories').limit(1)") < 0 && src.indexOf(".eq('key', 'pflx_player_tombstones').limit(1)") < 0);
  check('rank-up compares against the balance before the award', src.indexOf('var _rankBefore = getRankForXC(_xcBeforeAward);') > 0 && src.indexOf('var _xcBeforeAward = p.xc || 0;') < src.indexOf('var updated = applyUpdate(playerId, changes'));
  check('live reward scenes replace the plain toasts', src.indexOf('window.pflxNotify.liveDeliver(p.id, p.pendingXcoinEvents)') > 0 && src.indexOf('if (!__livePopups && (dxc > 0 || dbadges > 0)) {') > 0);
  check('popup labels for XC and rank', src.indexOf("label: 'X-COIN EARNED'") > 0 && src.indexOf("label: 'RANK UP'") > 0 && src.indexOf("label: 'X-COIN DEDUCTED'") > 0);
  check('login replay reads the cloud row and dedupes', src.indexOf("return deliver(id, all);") > 0 && src.indexOf("var SEEN_LS = 'pflx_reward_seen_v1';") > 0);
  check('cloud ingest defers the player reconcile', src.indexOf('window._mcReconcileLaterT = setTimeout(') > 0);
  check('legacy mirror on echoes checks the stamp first', src.indexOf("if (__echo && lm) {") > 0 && src.indexOf("lms >= __mcMs - 15000") > 0);
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
