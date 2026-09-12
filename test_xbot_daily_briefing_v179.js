// Unit tests for PATCH PLATFORM v179: xb-9's genuinely date-gated
// once-per-day "Today's Briefing" card, distinct from v171's fix
// (which only made X-Bot auto-open on EVERY login, not once/day).
// Extracts the REAL shipped functions out of preview.html via
// brace/string matching -- never a reimplementation. The orchestrator
// (pflxXBotDailyBriefingCheck) is the only piece that touches the
// network/DOM; everything else below is pure and directly testable.
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

check('PFLX_PATCH bumped to 179', src.indexOf("window.PFLX_PATCH   = 179;") !== -1);

// ── Markup/wiring checks ──
check('post-login hook calls the real pflxXBotDailyBriefingCheck', src.indexOf("if (typeof window.pflxXBotDailyBriefingCheck === 'function') window.pflxXBotDailyBriefingCheck();") !== -1);
check('the hook lives inside a try/catch (never blocks login)', src.indexOf("try { if (typeof window.pflxXBotDailyBriefingCheck === 'function') window.pflxXBotDailyBriefingCheck(); } catch (e) {}") !== -1);

// ── Sandbox: extract the whole X-Bot Contextual Briefing IIFE (v179
// extends the SAME block that already owns PFLX_XBOT_BRIEFINGS/
// pflxXBotBrief/xbotAddMessage rendering) and run it for real. ──
function makeSandbox(opts) {
  opts = opts || {};
  const START = '        (function () {\n          \'use strict\';\n          window.PFLX_XBOT_BRIEFINGS = {';
  const END_MARKER = "console.log('[PFLX] X-Bot Contextual Briefings loaded');\n        })();";
  const blockWithMarker = extractBetween(src, START, END_MARKER);

  const dbCalls = [];
  const upsertCalls = [];
  const win = {
    activeSession: Object.prototype.hasOwnProperty.call(opts, 'session') ? opts.session : { id: 'u1', role: 'player' },
    xbotAddMessage: undefined, // set on `window` below? no -- xbotAddMessage is a bare identifier in real code, see below
  };
  const messagesLogged = [];
  // The real code calls the bare identifier `xbotAddMessage` (not
  // window.xbotAddMessage) guarded by `typeof xbotAddMessage === 'function'`
  // -- so it must exist as a real local/global name inside the Function
  // scope, not just a `window` property.
  function xbotAddMessage(msg, isUser, kind) { messagesLogged.push({ msg: msg, isUser: isUser, kind: kind }); }

  // Same reasoning for _pflxLoadRewardRequests/mcTasks -- v179's
  // pflxXBotDailyBriefingPendingApprovals reads them as bare identifiers
  // (cross-<script>-block globals in the real file), so the sandbox must
  // provide them the same way.
  const _pflxLoadRewardRequests = opts.hasRewardFn === false ? undefined : function () { return opts.rewardRequests || []; };
  let mcTasks = Object.prototype.hasOwnProperty.call(opts, 'mcTasks') ? opts.mcTasks : undefined;

  // Fake Supabase client -- mimics the real `sb.from('app_data').select(...).eq(...).maybeSingle()`
  // and `.upsert(...)` chain shape used throughout this file.
  const cloudRows = opts.cloudRows || {}; // key -> { data: {...} }
  function makeSb() {
    return {
      from: function (table) {
        return {
          select: function () {
            return {
              eq: function (col, val) {
                return {
                  maybeSingle: function () {
                    dbCalls.push({ op: 'select', key: val });
                    if (opts.selectThrows) return Promise.reject(new Error('boom'));
                    const row = cloudRows[val];
                    return Promise.resolve({ data: row ? { data: row.data } : null });
                  }
                };
              }
            };
          },
          upsert: function (payload) {
            upsertCalls.push(payload);
            if (opts.upsertThrows) return Promise.reject(new Error('boom'));
            cloudRows[payload.key] = { data: payload.data };
            return Promise.resolve({});
          }
        };
      }
    };
  }
  win.pflxSupabase = opts.hasSupabase === false ? undefined : function () { return opts.supabaseReturnsNull ? null : makeSb(); };
  win.pflxXBotLoadSessions = opts.hasLoadSessions === false ? undefined : function () { return Promise.resolve(opts.sessions || []); };

  const fn = new Function('window', 'xbotAddMessage', '_pflxLoadRewardRequests', 'mcTasks', blockWithMarker);
  fn(win, xbotAddMessage, _pflxLoadRewardRequests, mcTasks);

  return {
    win: win,
    messagesLogged: messagesLogged,
    dbCalls: dbCalls,
    upsertCalls: upsertCalls,
    cloudRows: cloudRows,
  };
}

// ── pflxXBotBriefingDateStr: pure YYYY-MM-DD formatting ──
{
  const sb = makeSandbox();
  const d = new Date(2026, 8, 12); // Sept 12, 2026 (JS months are 0-indexed)
  check('pflxXBotBriefingDateStr formats Sept 12 2026 as 2026-09-12', sb.win.pflxXBotBriefingDateStr(d) === '2026-09-12');
}
{
  const sb = makeSandbox();
  const d = new Date(2026, 0, 5); // Jan 5, 2026 -- exercises zero-padding
  check('pflxXBotBriefingDateStr zero-pads single-digit month/day', sb.win.pflxXBotBriefingDateStr(d) === '2026-01-05');
}
{
  const sb = makeSandbox();
  check('pflxXBotBriefingDateStr defaults to "now" when called with no arg', /^\d{4}-\d{2}-\d{2}$/.test(sb.win.pflxXBotBriefingDateStr()));
}

// ── pflxXBotDailyBriefingDue: the pure date-gate itself ──
{
  const sb = makeSandbox();
  check('same day -> NOT due', sb.win.pflxXBotDailyBriefingDue('2026-09-12', '2026-09-12') === false);
}
{
  const sb = makeSandbox();
  check('different day -> due', sb.win.pflxXBotDailyBriefingDue('2026-09-11', '2026-09-12') === true);
}
{
  const sb = makeSandbox();
  check('missing (null) stored date -> due', sb.win.pflxXBotDailyBriefingDue(null, '2026-09-12') === true);
}
{
  const sb = makeSandbox();
  check('missing (undefined) stored date -> due', sb.win.pflxXBotDailyBriefingDue(undefined, '2026-09-12') === true);
}
{
  const sb = makeSandbox();
  check('malformed (non-string) stored date -> due, never throws', sb.win.pflxXBotDailyBriefingDue(12345, '2026-09-12') === true);
}
{
  const sb = makeSandbox();
  let threw = false;
  try { sb.win.pflxXBotDailyBriefingDue({ garbage: true }, '2026-09-12'); } catch (e) { threw = true; }
  check('an object as a malformed stored date does not throw', threw === false);
}
{
  const sb = makeSandbox();
  check('no todayStr at all -> safely NOT due (defensive, should never happen in practice)', sb.win.pflxXBotDailyBriefingDue('2026-09-11', null) === false);
}

// ── pflxXBotDailyBriefingCloudKey: per-user single-writer row ──
{
  const sb = makeSandbox();
  check('cloud key is per-user (pflx_xbot_briefing_ + id)', sb.win.pflxXBotDailyBriefingCloudKey({ id: 'abc123' }) === 'pflx_xbot_briefing_abc123');
}
{
  const sb = makeSandbox();
  check('two different users get two different keys (no cross-user collision)',
    sb.win.pflxXBotDailyBriefingCloudKey({ id: 'userA' }) !== sb.win.pflxXBotDailyBriefingCloudKey({ id: 'userB' }));
}
{
  const sb = makeSandbox();
  check('no session -> null key, not a throw', sb.win.pflxXBotDailyBriefingCloudKey(null) === null);
}
{
  const sb = makeSandbox();
  check('session with no id -> null key', sb.win.pflxXBotDailyBriefingCloudKey({ role: 'host' }) === null);
}

// ── pflxXBotDailyBriefingLiveSessionCount ──
{
  const sb = makeSandbox();
  check('counts only status === "active" sessions', sb.win.pflxXBotDailyBriefingLiveSessionCount([
    { id: 's1', status: 'active' }, { id: 's2', status: 'ended' }, { id: 's3', status: 'active' }, { id: 's4', status: 'scheduled' }
  ]) === 2);
}
{
  const sb = makeSandbox();
  check('zero live sessions -> 0', sb.win.pflxXBotDailyBriefingLiveSessionCount([{ id: 's1', status: 'ended' }]) === 0);
}
{
  const sb = makeSandbox();
  check('non-array input -> 0, never throws', sb.win.pflxXBotDailyBriefingLiveSessionCount(null) === 0);
}
{
  const sb = makeSandbox();
  check('a null entry in the sessions array does not throw', sb.win.pflxXBotDailyBriefingLiveSessionCount([null, { id: 's1', status: 'active' }]) === 1);
}

// ── pflxXBotDailyBriefingIsHost ──
{
  const sb = makeSandbox();
  check('role "host" is a host', sb.win.pflxXBotDailyBriefingIsHost({ role: 'Host' }) === true);
}
{
  const sb = makeSandbox();
  check('role "admin"/"teacher"/"instructor" are all hosts', ['admin', 'teacher', 'instructor'].every(function (r) { return sb.win.pflxXBotDailyBriefingIsHost({ role: r }) === true; }));
}
{
  const sb = makeSandbox();
  check('role "player" is not a host', sb.win.pflxXBotDailyBriefingIsHost({ role: 'player' }) === false);
}
{
  const sb = makeSandbox();
  check('no session -> not a host, not a throw', sb.win.pflxXBotDailyBriefingIsHost(null) === false);
}

// ── pflxXBotDailyBriefingMessage: pure string composition ──
{
  const sb = makeSandbox();
  const msg = sb.win.pflxXBotDailyBriefingMessage(0, 0, false);
  check('player, no live sessions: says "No live sessions" and omits Approvals entirely', msg.indexOf('No live sessions right now.') !== -1 && msg.indexOf('Approvals') === -1);
}
{
  const sb = makeSandbox();
  const msg = sb.win.pflxXBotDailyBriefingMessage(1, 0, false);
  check('player, exactly 1 live session: singular "session" (not "sessions")', msg.indexOf('1 live session right now.') !== -1 && msg.indexOf('1 live sessions') === -1);
}
{
  const sb = makeSandbox();
  const msg = sb.win.pflxXBotDailyBriefingMessage(3, 0, false);
  check('player, 3 live sessions: plural "sessions"', msg.indexOf('3 live sessions right now.') !== -1);
}
{
  const sb = makeSandbox();
  const msg = sb.win.pflxXBotDailyBriefingMessage(0, 0, true);
  check('host with a clear queue: "Approvals queue is clear."', msg.indexOf('Approvals queue is clear.') !== -1);
}
{
  const sb = makeSandbox();
  const msg = sb.win.pflxXBotDailyBriefingMessage(0, 1, true);
  check('host with exactly 1 pending item: singular "item"', msg.indexOf('1 item waiting in Approvals.') !== -1 && msg.indexOf('1 items') === -1);
}
{
  const sb = makeSandbox();
  const msg = sb.win.pflxXBotDailyBriefingMessage(0, 5, true);
  check('host with 5 pending items: plural "items"', msg.indexOf('5 items waiting in Approvals.') !== -1);
}
{
  const sb = makeSandbox();
  const msg = sb.win.pflxXBotDailyBriefingMessage(2, 4, false);
  check('a NON-host never sees approvals info, even if a count is passed in', msg.indexOf('Approvals') === -1 && msg.indexOf('4') === -1);
}

// ── pflxXBotDailyBriefingPendingApprovals: reuses the SAME two sources
// renderApprovalsCard() itself aggregates -- reward requests + mcTasks
// submissions -- as a count only. ──
{
  const sb = makeSandbox({ rewardRequests: [{ status: 'pending' }, { status: 'approved' }, { status: 'pending' }] });
  check('counts only pending reward requests', sb.win.pflxXBotDailyBriefingPendingApprovals() === 2);
}
{
  const sb = makeSandbox({
    mcTasks: [
      { id: 't1', submissions: [{ status: 'pending' }, { status: 'approved' }] },
      { id: 't2', status: 'submitted' },
      { id: 't3', status: 'draft' },
    ]
  });
  check('counts pending per-player submissions[] entries PLUS legacy submitted-status tasks', sb.win.pflxXBotDailyBriefingPendingApprovals() === 2);
}
{
  const sb = makeSandbox({
    rewardRequests: [{ status: 'pending' }],
    mcTasks: [{ id: 't1', status: 'submitted' }],
  });
  check('reward requests and task submissions are summed together', sb.win.pflxXBotDailyBriefingPendingApprovals() === 2);
}
{
  const sb = makeSandbox({ hasRewardFn: false, mcTasks: undefined });
  check('missing _pflxLoadRewardRequests / mcTasks -> 0, never throws', sb.win.pflxXBotDailyBriefingPendingApprovals() === 0);
}

// ── pflxXBotDailyBriefingCheck: the orchestrator, end to end ──
(async function () {
  // Case: due (no stored date yet) -- fires the message AND writes today's date.
  {
    const sb = makeSandbox({
      session: { id: 'hostA', role: 'host' },
      sessions: [{ id: 's1', status: 'active' }],
      rewardRequests: [{ status: 'pending' }],
    });
    await sb.win.pflxXBotDailyBriefingCheck();
    check('orchestrator: first run of the day posts exactly one chat message', sb.messagesLogged.length === 1);
    check('orchestrator: posted message mentions the live session AND the pending approval (host)', sb.messagesLogged[0] && sb.messagesLogged[0].msg.indexOf('live session') !== -1 && sb.messagesLogged[0].msg.indexOf('Approvals') !== -1);
    check('orchestrator: message rendered via the "briefing" kind, same as pflxXBotBrief', sb.messagesLogged[0] && sb.messagesLogged[0].kind === 'briefing');
    check('orchestrator: wrote todays date to the cloud under the per-user key', sb.upsertCalls.length === 1 && sb.upsertCalls[0].key === 'pflx_xbot_briefing_hostA');
  }

  // Case: NOT due (already ran today) -- must not post a second message or write again.
  {
    const today = new Date();
    const pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    const todayStr = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
    const sb = makeSandbox({
      session: { id: 'hostB', role: 'host' },
      cloudRows: { pflx_xbot_briefing_hostB: { data: { lastDate: todayStr } } },
    });
    await sb.win.pflxXBotDailyBriefingCheck();
    check('orchestrator: already ran today -> no chat message posted', sb.messagesLogged.length === 0);
    check('orchestrator: already ran today -> no cloud write either', sb.upsertCalls.length === 0);
  }

  // Case: player (non-host) -- message must never mention Approvals.
  {
    const sb = makeSandbox({
      session: { id: 'playerA', role: 'player' },
      sessions: [],
      rewardRequests: [{ status: 'pending' }],
    });
    await sb.win.pflxXBotDailyBriefingCheck();
    check('orchestrator: a PLAYER session never sees Approvals info, even with real pending items in the cloud', sb.messagesLogged.length === 1 && sb.messagesLogged[0].msg.indexOf('Approvals') === -1);
  }

  // Case: no active session -- must no-op entirely.
  {
    const sb = makeSandbox({ session: null });
    await sb.win.pflxXBotDailyBriefingCheck();
    check('orchestrator: no activeSession -> no message, no cloud call, no throw', sb.messagesLogged.length === 0 && sb.dbCalls.length === 0 && sb.upsertCalls.length === 0);
  }

  // Case: pflxSupabase entirely absent -- must still fail safe (never throw),
  // and per the pure date-gate, a null/missing stored date IS due, so the
  // message still fires (a host with no cloud connectivity still gets today's
  // briefing locally -- it just can't persist the "already shown" flag).
  {
    const sb = makeSandbox({ session: { id: 'hostC', role: 'host' }, hasSupabase: false, hasLoadSessions: false });
    let threw = false;
    try { await sb.win.pflxXBotDailyBriefingCheck(); } catch (e) { threw = true; }
    check('orchestrator: no pflxSupabase / no pflxXBotLoadSessions -> never throws', threw === false);
    check('orchestrator: still posts a briefing message even with no cloud (fails open, not silently)', sb.messagesLogged.length === 1);
  }

  // Case: the cloud read throws -- must still fail safe and still show the
  // briefing (a transient network error shouldn't silently suppress it forever).
  {
    const sb = makeSandbox({ session: { id: 'hostD', role: 'host' }, selectThrows: true });
    let threw = false;
    try { await sb.win.pflxXBotDailyBriefingCheck(); } catch (e) { threw = true; }
    check('orchestrator: a cloud SELECT error does not throw', threw === false);
    check('orchestrator: a cloud SELECT error still allows the briefing to show (treated as due)', sb.messagesLogged.length === 1);
  }

  // Case: the cloud write (upsert) throws -- the message must already have
  // been shown to the user before the write is attempted, so a save failure
  // never un-shows it.
  {
    const sb = makeSandbox({ session: { id: 'hostE', role: 'host' }, upsertThrows: true });
    let threw = false;
    try { await sb.win.pflxXBotDailyBriefingCheck(); } catch (e) { threw = true; }
    check('orchestrator: a cloud UPSERT error does not throw', threw === false);
    check('orchestrator: the message still posted even though the save-back failed', sb.messagesLogged.length === 1);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
