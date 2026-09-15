// Unit tests for PATCH PLATFORM v202: Ennis, sent (twice, then a third
// time verbatim): "Also allow a screenshare go live to the theater as
// well. This way I could screenshare Gimkit or Blooket for a live game
// amongst either a live session (slides) or simply a live open
// broadcast. The screenshare should include chrome tabs, PFLX, windows,
// applications, and desktop." Part 1 of 2 (part 2 is the native browser
// screen-share option, still to come): ties the already-working v180
// OBS/YouTube relay to a specific X-Live session's Theater, via the real
// merge-safe session bridge. Extracts the REAL shipped code out of
// preview.html via string-marker extraction -- never a reimplementation.
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

// -- Markup / wiring checks --
check('PFLX_PATCH bumped to 202', src.indexOf("window.PFLX_PATCH   = 202;") !== -1);
check('new session-attach mount point div added to the Go Live card',
  src.indexOf('<div id="xbot-yt-session-attach-wrap" style="margin-top:10px;"></div>') !== -1);
check('TOOLS subtab switch now also calls the session-attach picker',
  src.indexOf("if (tab === 'tools') { window.xbotLiveRenderYtStatus(); window.xbotLiveRenderSessionAttachPicker(); }") !== -1);
check('xbotLiveEndYouTubeStream now detaches any attached session on stream end',
  /window\.xbotLiveEndYouTubeStream = function \(\) \{[\s\S]{0,500}_xbotYtAttachedSessionId[\s\S]{0,200}xbotLiveDetachSessionBroadcast/.test(src));

check('window.xbotLiveRenderSessionAttachPicker defined',
  src.indexOf('window.xbotLiveRenderSessionAttachPicker = async function () {') !== -1);
check('window.xbotLiveAttachBroadcastToSession defined',
  src.indexOf('window.xbotLiveAttachBroadcastToSession = async function () {') !== -1);
check('window.xbotLiveDetachSessionBroadcast defined',
  src.indexOf('window.xbotLiveDetachSessionBroadcast = async function () {') !== -1);

const pickerSrc = extractUpTo(src,
  'window.xbotLiveRenderSessionAttachPicker = async function () {',
  'window.xbotLiveAttachBroadcastToSession = async function () {');
const attachSrc = extractUpTo(src,
  'window.xbotLiveAttachBroadcastToSession = async function () {',
  'window.xbotLiveDetachSessionBroadcast = async function () {');
const detachSrc = extractUpTo(src,
  'window.xbotLiveDetachSessionBroadcast = async function () {',
  '// ══ PATCH PLATFORM v184');

// -- Behavioral: window.xbotLiveRenderSessionAttachPicker (extracted, real code) --
(async function () {
  function run(domEl, ytStatus, sessions, attachedId, escapeHtmlImpl) {
    const win = {
      ytGetLiveStatus: function () { return ytStatus; },
      pflxXBotLoadSessions: async function () { return sessions; },
      _xbotYtAttachedSessionId: attachedId || null,
    };
    const doc = { getElementById: function (id) { return id === 'xbot-yt-session-attach-wrap' ? domEl : null; } };
    const escapeHtml = escapeHtmlImpl || function (s) { return String(s == null ? '' : s); };
    const fn = new Function('window', 'document', 'escapeHtml',
      pickerSrc + '\nreturn window.xbotLiveRenderSessionAttachPicker;');
    return { call: fn(win, doc, escapeHtml), win: win };
  }

  // no active broadcast -> wrap cleared, no throw
  let el = { innerHTML: 'stale' };
  await run(el, { activeBroadcast: null }, [], null).call();
  check('no active broadcast clears the wrap to empty', el.innerHTML === '');

  // active broadcast, already attached -> shows attached state + detach button
  el = { innerHTML: '' };
  await run(el, { activeBroadcast: { id: 'yt_real_123', title: 'X' } },
    [{ id: 'sess_1', title: 'Friday Algebra Live', status: 'active' }], 'sess_1').call();
  check('already-attached state shows the real session title', el.innerHTML.indexOf('Friday Algebra Live') !== -1);
  check('already-attached state offers a Detach action', el.innerHTML.indexOf('xbotLiveDetachSessionBroadcast()') !== -1);

  // active broadcast, local-only (fake) id -> honest "needs real connection" message, no picker
  el = { innerHTML: '' };
  await run(el, { activeBroadcast: { id: 'local_987', title: 'X' } }, [{ id: 'sess_1', status: 'active' }], null).call();
  check('a local-only (fake) broadcast id never offers attachment', el.innerHTML.indexOf('needs a real YouTube connection') !== -1);
  check('a local-only (fake) broadcast id never renders a session <select>', el.innerHTML.indexOf('<select') === -1);

  // active + real broadcast, no live sessions -> honest "stays open broadcast" message
  el = { innerHTML: '' };
  await run(el, { activeBroadcast: { id: 'yt_real_1', title: 'X' } }, [{ id: 'sess_1', status: 'ended' }], null).call();
  check('no currently-live sessions shows the "stays an open broadcast" message', el.innerHTML.indexOf('stays an open broadcast') !== -1);

  // active + real broadcast, live sessions available -> renders a picker with only active sessions
  el = { innerHTML: '' };
  await run(el, { activeBroadcast: { id: 'yt_real_1', title: 'X' } },
    [{ id: 'sess_1', title: 'Live One', status: 'active' }, { id: 'sess_2', title: 'Ended One', status: 'ended' }], null).call();
  check('picker only lists currently-active sessions', el.innerHTML.indexOf('Live One') !== -1 && el.innerHTML.indexOf('Ended One') === -1);
  check('picker defaults to "keep as open broadcast"', el.innerHTML.indexOf('-- Keep as open broadcast --') !== -1);

  // XSS check -- proves escapeHtml is actually CALLED on the title, not skipped
  el = { innerHTML: '' };
  const escapeCalls = [];
  await run(el, { activeBroadcast: { id: 'yt_real_1', title: 'X' } },
    [{ id: 's1', title: '<script>evil</script>', status: 'active' }], null,
    function (s) { escapeCalls.push(s); return '[escaped]'; }).call();
  check('picker routes session titles through escapeHtml (XSS-safe)', escapeCalls.indexOf('<script>evil</script>') !== -1);

  // -- Behavioral: window.xbotLiveAttachBroadcastToSession (extracted, real code) --
  function runAttach(selVal, ytStatus, sessions) {
    const savedSessions = [];
    const toasts = [];
    const win = {
      ytGetLiveStatus: function () { return ytStatus; },
      pflxXBotLoadSessions: async function () { return sessions; },
      pflxXBotSaveSession: async function (s) { savedSessions.push(JSON.parse(JSON.stringify(s))); return s; },
      xbotLiveRenderSessionAttachPicker: function () {},
      _xbotYtAttachedSessionId: null,
    };
    const doc = { getElementById: function (id) { return id === 'xbot-yt-session-select' ? { value: selVal } : null; } };
    const pflxToast = function (msg, kind) { toasts.push([msg, kind]); };
    const fn = new Function('window', 'document', 'pflxToast',
      attachSrc + '\nreturn window.xbotLiveAttachBroadcastToSession;');
    return { call: fn(win, doc, pflxToast), win: win, saved: savedSessions, toasts: toasts };
  }

  let ctx = runAttach('', { activeBroadcast: { id: 'yt_real_1', title: 'X' } }, [{ id: 's1', status: 'active' }]);
  await ctx.call();
  check('attach with nothing selected is a safe no-op', ctx.saved.length === 0);

  ctx = runAttach('s1', { activeBroadcast: { id: 'local_999', title: 'X' } }, [{ id: 's1', status: 'active' }]);
  await ctx.call();
  check('attach refuses a local-only (fake) broadcast id', ctx.saved.length === 0 && ctx.toasts.some(function (t) { return t[1] === 'error'; }));

  ctx = runAttach('s_missing', { activeBroadcast: { id: 'yt_real_1', title: 'X' } }, [{ id: 's1', status: 'active' }]);
  await ctx.call();
  check('attach errors cleanly when the selected session id is not found', ctx.saved.length === 0 && ctx.toasts.some(function (t) { return t[1] === 'error'; }));

  ctx = runAttach('s1', { activeBroadcast: { id: 'yt_real_ABC', title: 'X' } }, [{ id: 's1', title: 'Live One', status: 'active' }]);
  await ctx.call();
  check('attach writes the real broadcast id onto sess.youtubeEmbedId', ctx.saved.length === 1 && ctx.saved[0].youtubeEmbedId === 'yt_real_ABC');
  check('attach saves through the real merge-safe pflxXBotSaveSession bridge (not a raw upsert)', ctx.saved[0].id === 's1');
  check('attach sets window._xbotYtAttachedSessionId so future renders know the state', ctx.win._xbotYtAttachedSessionId === 's1');
  check('attach shows a success toast', ctx.toasts.some(function (t) { return t[1] === 'success'; }));

  // -- Behavioral: window.xbotLiveDetachSessionBroadcast (extracted, real code) --
  function runDetach(attachedId, sessions) {
    const savedSessions = [];
    const toasts = [];
    const win = {
      pflxXBotLoadSessions: async function () { return sessions; },
      pflxXBotSaveSession: async function (s) { savedSessions.push(JSON.parse(JSON.stringify(s))); return s; },
      xbotLiveRenderSessionAttachPicker: function () {},
      _xbotYtAttachedSessionId: attachedId,
    };
    const pflxToast = function (msg, kind) { toasts.push([msg, kind]); };
    const fn = new Function('window', 'pflxToast', detachSrc + '\nreturn window.xbotLiveDetachSessionBroadcast;');
    return { call: fn(win, pflxToast), win: win, saved: savedSessions, toasts: toasts };
  }

  ctx = runDetach(null, []);
  await ctx.call();
  check('detach with nothing attached is a safe no-op', ctx.saved.length === 0);

  ctx = runDetach('s1', [{ id: 's1', title: 'Live One', status: 'active', youtubeEmbedId: 'yt_real_ABC' }]);
  await ctx.call();
  check('detach nulls out sess.youtubeEmbedId (not deletes the key, not a stale string)', ctx.saved.length === 1 && ctx.saved[0].youtubeEmbedId === null);
  check('detach clears window._xbotYtAttachedSessionId', ctx.win._xbotYtAttachedSessionId === null);
  check('detach shows an info toast', ctx.toasts.some(function (t) { return t[1] === 'info'; }));

  ctx = runDetach('s_gone', []);
  let threw = false;
  try { await ctx.call(); } catch (e) { threw = true; }
  check('detach never throws when the attached session no longer exists', !threw);
  check('detach still clears the stale flag even when the session is gone', ctx.win._xbotYtAttachedSessionId === null);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail > 0 ? 1 : 0);
})();
