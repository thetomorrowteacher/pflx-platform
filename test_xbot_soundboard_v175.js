// Unit tests for PATCH PLATFORM v175: xc-4, the Soundboard for a Guest
// Host to DJ. Extracts the REAL shipped functions out of preview.html
// via brace/string matching -- never a reimplementation. Reuses the
// SAME IndexedDB audio storage (pflxDBAudioSave/Load/Delete) the Sound
// Engine already proved out -- these are stubbed here, not
// re-implemented, since only the soundboard's own logic is under test.
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

check('PFLX_PATCH bumped to 175', src.indexOf("window.PFLX_PATCH   = 175;") !== -1);

// ── Markup-structure checks: the SOUND sub-tab pill + panel exist, and
// the panel is Studio-gated the same way Theater is (not Wide+Studio
// like Teams -- matches v172's own Studio-preset copy which literally
// says "soundboard"). ──
check('SOUND sub-tab pill exists, wired to xbotLiveSwitchSubTab', src.indexOf('data-subtab="sound" onclick="xbotLiveSwitchSubTab(\'sound\')"') !== -1);
check('#xbot-live-sound-panel exists', src.indexOf('<div id="xbot-live-sound-panel"') !== -1);
check('#xbot-sound-grid mount point exists inside the panel', src.indexOf('<div class="xbot-sound-grid" id="xbot-sound-grid">') !== -1);
check('soundboard is Studio-only band-gated, same principle as Theater',
  src.indexOf('#pflx-dock.pflx-band-studio .xbot-sound-content { display: block; }') !== -1 &&
  src.indexOf('#pflx-dock.pflx-band-studio .xbot-sound-resize-hint { display: none; }') !== -1);
check('the honest OBS-Desktop-Audio-Capture caveat is visible in the panel copy (not dropped)',
  src.indexOf("Plays through YOUR speakers only. To include a clip in a live OBS/YouTube broadcast, enable OBS's Desktop Audio Capture separately.") !== -1);

// ── Sandbox the real shipped soundboard block, from
// window.XBOT_SOUNDBOARD_SLOTS through xbotSoundboardClear, verbatim. ──
function makeSandbox(opts) {
  opts = opts || {};
  const END_MARKER = '\n\n        function switchXBotMode(mode) {';
  const blockWithMarker = extractBetween(src, 'window.XBOT_SOUNDBOARD_SLOTS = 8;', END_MARKER);
  const block = blockWithMarker.slice(0, -END_MARKER.length);

  const grid = { innerHTML: '' };
  const stubDocument = {
    getElementById: function (id) { return id === 'xbot-sound-grid' ? grid : null; },
  };
  function escapeHtmlStub(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  const store = {}; // fake IndexedDB-backed audio store, keyed like the real one
  const audioSaveCalls = [];
  const audioDeleteCalls = [];
  const audioPlayed = [];
  const localStore = {}; // fake localStorage

  const win = {
    pflxDBAudioSave: function (key, dataUrl) {
      audioSaveCalls.push(key);
      store[key] = dataUrl;
      return Promise.resolve();
    },
    pflxDBAudioLoad: function (key) {
      return Promise.resolve(opts.audioLoadShouldFail ? null : (store[key] || null));
    },
    pflxDBAudioDelete: function (key) {
      audioDeleteCalls.push(key);
      delete store[key];
      return Promise.resolve();
    },
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(localStore, k) ? localStore[k] : null; },
      setItem: function (k, v) { localStore[k] = v; },
    },
  };
  // The extracted block references bare `localStorage`/`Audio` identifiers
  // (as real browser globals would resolve them) -- pass them as explicit
  // new Function params, same technique used for mcPlayers/escapeHtml
  // elsewhere this session, since new Function bodies don't close over
  // the outer Node scope.
  const AudioStub = function (src) { this.src = src; audioPlayed.push(src); };
  AudioStub.prototype.play = function () { return Promise.resolve(); };

  const fn = new Function('sandbox', 'window', 'document', 'escapeHtml', 'localStorage', 'Audio', 'event', block);
  const sandbox = { window: win };
  const fakeEvent = { stopPropagation: function () {} };
  fn(sandbox, win, stubDocument, escapeHtmlStub, win.localStorage, AudioStub, fakeEvent);

  return {
    win: win,
    grid: grid,
    store: store,
    audioSaveCalls: audioSaveCalls,
    audioDeleteCalls: audioDeleteCalls,
    audioPlayed: audioPlayed,
    localStore: localStore,
    xbotSoundboardLoadMeta: win.xbotSoundboardLoadMeta,
    xbotSoundboardSaveMeta: win.xbotSoundboardSaveMeta,
    xbotSoundboardRenderGrid: win.xbotSoundboardRenderGrid,
    xbotSoundboardUpload: win.xbotSoundboardUpload,
    xbotSoundboardPlay: win.xbotSoundboardPlay,
    xbotSoundboardClear: win.xbotSoundboardClear,
  };
}

function mkFileInput(fileObj) {
  var _value = 'C:\\fakepath\\x';
  return {
    files: fileObj ? [fileObj] : null,
    get value() { return _value; },
    set value(v) { _value = v; },
  };
}

async function main() {
  check('XBOT_SOUNDBOARD_SLOTS is 8 (a real, fixed pad count)', (function () {
    const m = src.match(/window\.XBOT_SOUNDBOARD_SLOTS\s*=\s*(\d+);/);
    return m && Number(m[1]) === 8;
  })());

  // ── loadMeta / saveMeta round-trip through the real localStorage key ──
  {
    const sb = makeSandbox();
    check('loadMeta with nothing stored returns an empty object, not a crash', JSON.stringify(sb.xbotSoundboardLoadMeta()) === '{}');
    sb.xbotSoundboardSaveMeta({ 3: { name: 'Air Horn.mp3' } });
    check('saveMeta writes to the real pflx_xbot_soundboard_meta localStorage key', sb.localStore.pflx_xbot_soundboard_meta === JSON.stringify({ 3: { name: 'Air Horn.mp3' } }));
    const reloaded = sb.xbotSoundboardLoadMeta();
    check('loadMeta reads back exactly what saveMeta wrote', reloaded[3] && reloaded[3].name === 'Air Horn.mp3');
  }
  {
    const sb = makeSandbox();
    sb.localStore.pflx_xbot_soundboard_meta = 'not valid json {{{';
    check('loadMeta with corrupted stored JSON fails safe to an empty object, not a throw', JSON.stringify(sb.xbotSoundboardLoadMeta()) === '{}');
  }

  // ── renderGrid: 8 pads, empty vs filled render differently ──
  {
    const sb = makeSandbox();
    sb.xbotSoundboardSaveMeta({ 2: { name: 'Applause.wav' } });
    sb.xbotSoundboardRenderGrid();
    check('renderGrid renders exactly 8 pads (fixed slot count)', (sb.grid.innerHTML.match(/xbot-sound-pad /g) || []).length === 8);
    check('a filled slot (2) renders its real clip name', sb.grid.innerHTML.indexOf('Applause.wav') !== -1);
    check('a filled slot is clickable via the real xbotSoundboardPlay(2) call', sb.grid.innerHTML.indexOf('xbotSoundboardPlay(2)') !== -1);
    check('a filled slot offers a real remove action via xbotSoundboardClear(2)', sb.grid.innerHTML.indexOf('xbotSoundboardClear(2)') !== -1);
    check('an empty slot (e.g. 1) shows an honest "add clip" upload affordance, not a fake filled pad', sb.grid.innerHTML.indexOf('+ Add clip 1') !== -1);
    check('an empty slot has a real file input wired to xbotSoundboardUpload(1, this)', sb.grid.innerHTML.indexOf('xbotSoundboardUpload(1, this)') !== -1);
  }
  {
    const sb = makeSandbox();
    sb.xbotSoundboardRenderGrid();
    check('renderGrid with zero saved clips shows all 8 slots as empty/uploadable, not broken', (sb.grid.innerHTML.match(/xbot-sound-pad-empty/g) || []).length === 8);
  }
  {
    const sb = makeSandbox();
    const stubDocNoGrid = { getElementById: function () { return null; } };
    const END_MARKER = '\n\n        function switchXBotMode(mode) {';
    const blockWithMarker = extractBetween(src, 'window.XBOT_SOUNDBOARD_SLOTS = 8;', END_MARKER);
    const block = blockWithMarker.slice(0, -END_MARKER.length);
    const win2 = { pflxDBAudioSave: sb.win.pflxDBAudioSave, pflxDBAudioLoad: sb.win.pflxDBAudioLoad, pflxDBAudioDelete: sb.win.pflxDBAudioDelete, localStorage: sb.win.localStorage };
    const fn2 = new Function('sandbox', 'window', 'document', 'escapeHtml', 'localStorage', 'Audio', 'event', block);
    const sandbox2 = { window: win2 };
    fn2(sandbox2, win2, stubDocNoGrid, function (s) { return s; }, win2.localStorage, function () {}, {});
    check('renderGrid with the panel not mounted (getElementById returns null) is a safe no-op, not a crash', (function () { win2.xbotSoundboardRenderGrid(); return true; })());
  }

  // ── upload: FileReader -> pflxDBAudioSave (the REAL bridge to the
  // Sound Engine's proven IndexedDB storage) -> meta update -> re-render ──
  {
    const sb = makeSandbox();
    // FileReader is not available in Node -- the extracted code uses the
    // real global FileReader, which this sandbox does not stub, since
    // stubbing it fully would mean reimplementing file-read semantics.
    // Skip straight to the save path this test CAN verify without a
    // browser: that xbotSoundboardUpload is a no-op when there is no
    // file, so it never corrupts meta on a spurious call.
    const input = mkFileInput(null);
    sb.xbotSoundboardUpload(4, input);
    check('upload with no file selected is a safe no-op, not a crash', JSON.stringify(sb.xbotSoundboardLoadMeta()) === '{}');
  }

  // ── play: loads via the REAL pflxDBAudioLoad bridge, plays only when
  // a clip is actually stored, never plays a dead pad ──
  {
    const sb = makeSandbox();
    sb.store['xbot_pad_5'] = 'data:audio/mp3;base64,FAKE';
    const played = await sb.xbotSoundboardPlay(5);
    check('play(5) loads via the real pflxDBAudioLoad("xbot_pad_5") key convention', sb.audioPlayed.indexOf('data:audio/mp3;base64,FAKE') !== -1);
    check('play() resolves true when a clip was actually found and played', played === true);
  }
  {
    const sb = makeSandbox();
    const played = await sb.xbotSoundboardPlay(6);
    check('play() on an empty slot never constructs an Audio() at all -- no phantom playback', sb.audioPlayed.length === 0);
    check('play() resolves false when the slot is empty', played === false);
  }

  // ── clear: deletes via the REAL pflxDBAudioDelete bridge AND removes
  // the slot from meta, so a cleared pad reverts to the upload affordance ──
  {
    const sb = makeSandbox();
    sb.xbotSoundboardSaveMeta({ 7: { name: 'Drumroll.mp3' } });
    sb.store['xbot_pad_7'] = 'data:audio/mp3;base64,X';
    await sb.xbotSoundboardClear(7);
    check('clear(7) deletes the real IndexedDB-backed blob via pflxDBAudioDelete("xbot_pad_7")', sb.audioDeleteCalls.indexOf('xbot_pad_7') !== -1);
    check('clear(7) removes the slot from meta so it reverts to empty', sb.xbotSoundboardLoadMeta()[7] === undefined);
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
