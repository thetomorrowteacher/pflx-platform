// Unit tests for the Console's YouTube API relay handler (Console side).
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

function extractFunction(src, marker) {
  const start = src.indexOf(marker);
  if (start === -1) throw new Error('not found: ' + marker);
  const braceStart = src.indexOf('{', start);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log('PASS: ' + label); }
  else { fail++; console.log('FAIL: ' + label); }
}

function makeSandbox() {
  const sandbox = {};
  const fnSrc = extractFunction(src, 'function pflxYtRelayHandle(');
  sandbox.ytConfig = { accessToken: '', channelId: '' };
  sandbox.ytLoadConfig = function () { sandbox.__configLoaded = true; };
  sandbox.calls = { ytApiFetch: [] };
  sandbox.ytApiFetch = function (endpoint, params, cb, method, body) {
    sandbox.calls.ytApiFetch.push({ endpoint: endpoint, params: params, method: method, body: body });
    sandbox.__lastCb = cb;
  };
  sandbox.ytRefreshBroadcasts = function () { sandbox.__refreshed = true; };
  sandbox.ytEndLive = function () { sandbox.__ytEndLiveCalled = true; };
  sandbox.ytActiveBroadcast = null;
  new Function('sandbox', 'with (sandbox) {\n' + fnSrc + '\nsandbox.pflxYtRelayHandle = pflxYtRelayHandle;\n}')(sandbox);
  return sandbox;
}

// ── 1. status action -- pure read, no API call ──────────────────────────
(function () {
  const sb = makeSandbox();
  sb.ytConfig.accessToken = '';
  var result = null;
  sb.pflxYtRelayHandle('status', {}, function (r) { result = r; });
  check('not connected -> connected:false, no API call made', result.ok === true && result.connected === false && sb.calls.ytApiFetch.length === 0);
})();

(function () {
  const sb = makeSandbox();
  sb.ytConfig.accessToken = 'tok123';
  sb.ytConfig.channelId = 'UCabc';
  var result = null;
  sb.pflxYtRelayHandle('status', {}, function (r) { result = r; });
  check('connected -> connected:true with channelId, still no API call', result.ok === true && result.connected === true && result.channelId === 'UCabc' && sb.calls.ytApiFetch.length === 0);
})();

// ── 2. createBroadcast / endBroadcast refuse when not connected ─────────
(function () {
  const sb = makeSandbox();
  sb.ytConfig.accessToken = '';
  var result = null;
  sb.pflxYtRelayHandle('createBroadcast', { title: 'X' }, function (r) { result = r; });
  check('createBroadcast refused when not connected (fails closed, no API call)', result.ok === false && result.error === 'not_connected' && sb.calls.ytApiFetch.length === 0);
})();

// ── 3. createBroadcast -- real API call shape + response mapping ────────
(function () {
  const sb = makeSandbox();
  sb.ytConfig.accessToken = 'tok123';
  var result = null;
  sb.pflxYtRelayHandle('createBroadcast', { title: 'Friday Live' }, function (r) { result = r; });
  check('exactly one ytApiFetch call made', sb.calls.ytApiFetch.length === 1);
  const call = sb.calls.ytApiFetch[0];
  check('POSTs to the real liveBroadcasts insert endpoint', call.endpoint.indexOf('/liveBroadcasts?') === 0 && call.method === 'POST');
  check('request body carries the session title as the broadcast title', call.body.snippet.title === 'Friday Live');
  check('privacy is unlisted (never public by default)', call.body.status.privacyStatus === 'unlisted');
  check('enableAutoStart/enableAutoStop set so OBS starting the feed goes live automatically', call.body.contentDetails.enableAutoStart === true && call.body.contentDetails.enableAutoStop === true);
  // simulate YouTube's response
  sb.__lastCb({ id: 'abc123XYZ90' });
  check('resolves with videoId + a real watch URL', result.ok === true && result.videoId === 'abc123XYZ90' && result.watchUrl.indexOf('abc123XYZ90') !== -1);
  check('triggers a broadcasts-list refresh so the Settings page stays in sync', sb.__refreshed === true);
})();

(function () {
  const sb = makeSandbox();
  sb.ytConfig.accessToken = 'tok123';
  var result = null;
  sb.pflxYtRelayHandle('createBroadcast', { title: 'X' }, function (r) { result = r; });
  sb.__lastCb({ error: { message: 'quotaExceeded' } });
  check('YouTube API error surfaces to the caller, not swallowed', result.ok === false && result.error === 'quotaExceeded');
})();

// ── 4. endBroadcast -- transitions to complete, syncs local live state ──
(function () {
  const sb = makeSandbox();
  sb.ytConfig.accessToken = 'tok123';
  sb.ytActiveBroadcast = { id: 'abc123XYZ90' };
  var result = null;
  sb.pflxYtRelayHandle('endBroadcast', { videoId: 'abc123XYZ90' }, function (r) { result = r; });
  const call = sb.calls.ytApiFetch[0];
  check('transitions the correct broadcast to complete', call.params.broadcastStatus === 'complete' && call.params.id === 'abc123XYZ90');
  sb.__lastCb({});
  check('resolves ok', result.ok === true);
  check('local ytEndLive() called to sync the Settings page UI/timers', sb.__ytEndLiveCalled === true);
})();

(function () {
  const sb = makeSandbox();
  sb.ytConfig.accessToken = 'tok123';
  var result = null;
  sb.pflxYtRelayHandle('endBroadcast', {}, function (r) { result = r; });
  check('missing videoId -> refused, no API call', result.ok === false && result.error === 'missing_videoId' && sb.calls.ytApiFetch.length === 0);
})();

// ── 5. unknown action -- fails closed ────────────────────────────────────
(function () {
  const sb = makeSandbox();
  sb.ytConfig.accessToken = 'tok123';
  var result = null;
  sb.pflxYtRelayHandle('deleteEverything', {}, function (r) { result = r; });
  check('unknown action refused, no API call made', result.ok === false && result.error === 'unknown_action' && sb.calls.ytApiFetch.length === 0);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
