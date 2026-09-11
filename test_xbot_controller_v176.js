// Unit tests for PATCH PLATFORM v176: xc-5/xc-6, the Controller Grid.
// "Both 1 and 2": (1) a software performance-pad grid dispatching to a
// small, honest action registry of already-real PFLX actions
// (Soundboard pads from xc-4, the existing Noise Meter toggle), and
// (2) real Web MIDI API hardware support, honestly feature-detected.
// Extracts the REAL shipped functions out of preview.html via
// brace/string matching -- never a reimplementation. The MIDI message
// PARSING/dispatch logic is pure and fully testable with synthetic
// byte arrays; actual hardware I/O (navigator.requestMIDIAccess itself)
// cannot be proven by a Node test and is not claimed to be here --
// only that it's feature-detected honestly and the message handler it
// would feed is correct.
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

check('PFLX_PATCH bumped to 176', src.indexOf("window.PFLX_PATCH   = 176;") !== -1);

// ── Markup-structure checks: the CONTROLLER sub-tab pill + panel
// exist, Studio-gated like Theater/Soundboard, and the MIDI section's
// two support/unsupported divs both exist (so renderGrid has both to
// toggle between). ──
check('CONTROLLER sub-tab pill exists, wired to xbotLiveSwitchSubTab', src.indexOf('data-subtab="controller" onclick="xbotLiveSwitchSubTab(\'controller\')"') !== -1);
check('#xbot-live-controller-panel exists', src.indexOf('<div id="xbot-live-controller-panel"') !== -1);
check('#xbot-controller-grid mount point exists inside the panel', src.indexOf('<div class="xbot-ctrl-grid" id="xbot-controller-grid"></div>') !== -1);
check('controller grid is Studio-only band-gated, same principle as Theater/Soundboard',
  src.indexOf('#pflx-dock.pflx-band-studio .xbot-ctrl-content { display: block; }') !== -1 &&
  src.indexOf('#pflx-dock.pflx-band-studio .xbot-ctrl-resize-hint { display: none; }') !== -1);
check('the honest MIDI-unsupported-browser message is present, not silently broken on Safari/Firefox',
  src.indexOf('MIDI hardware requires Chrome or Edge') !== -1);
check('a real MIDI device picker exists (#xbot-midi-device-select)', src.indexOf('id="xbot-midi-device-select"') !== -1);

// ── Sandbox the real shipped controller block, from
// window.XBOT_CONTROLLER_SLOTS through xbotControllerHandleMidiMessage. ──
function makeSandbox(opts) {
  opts = opts || {};
  const END_MARKER = '\n\n        function switchXBotMode(mode) {';
  const blockWithMarker = extractBetween(src, 'window.XBOT_CONTROLLER_SLOTS = 8;', END_MARKER);
  const block = blockWithMarker.slice(0, -END_MARKER.length);

  const grid = { innerHTML: '' };
  const supEl = { style: { display: '' } };
  const unsupEl = { style: { display: '' } };
  const midiSelect = { innerHTML: '' };
  const els = {
    'xbot-controller-grid': grid,
    'xbot-midi-supported': supEl,
    'xbot-midi-unsupported': unsupEl,
    'xbot-midi-device-select': midiSelect,
  };
  const stubDocument = { getElementById: function (id) { return els[id] || null; } };
  function escapeHtmlStub(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

  const localStore = {};
  const stubLocalStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(localStore, k) ? localStore[k] : null; },
    setItem: function (k, v) { localStore[k] = v; },
  };

  const soundboardPlayCalls = [];
  const noiseToggleCalls = [];
  const win = {
    localStorage: stubLocalStorage,
    xbotSoundboardPlay: function (n) { soundboardPlayCalls.push(n); },
    mcToggleNoiseMeter: function () { noiseToggleCalls.push(true); },
    navigator: opts.navigator, // undefined by default -- "no MIDI support" is the honest default in Node
  };

  const fn = new Function('sandbox', 'window', 'document', 'escapeHtml', 'localStorage', 'navigator', block);
  const sandbox = { window: win };
  fn(sandbox, win, stubDocument, escapeHtmlStub, stubLocalStorage, opts.navigator);

  return {
    win: win,
    grid: grid,
    supEl: supEl,
    unsupEl: unsupEl,
    midiSelect: midiSelect,
    localStore: localStore,
    soundboardPlayCalls: soundboardPlayCalls,
    noiseToggleCalls: noiseToggleCalls,
    xbotControllerLoadMap: win.xbotControllerLoadMap,
    xbotControllerSaveMap: win.xbotControllerSaveMap,
    xbotControllerSetPadAction: win.xbotControllerSetPadAction,
    xbotControllerFirePad: win.xbotControllerFirePad,
    xbotControllerRenderGrid: win.xbotControllerRenderGrid,
    xbotControllerMidiSupported: win.xbotControllerMidiSupported,
    xbotControllerConnectMidi: win.xbotControllerConnectMidi,
    xbotControllerSelectMidiDevice: win.xbotControllerSelectMidiDevice,
    xbotControllerStartLearn: win.xbotControllerStartLearn,
    xbotControllerCancelLearn: win.xbotControllerCancelLearn,
    xbotControllerLoadMidiMap: win.xbotControllerLoadMidiMap,
    xbotControllerSaveMidiMap: win.xbotControllerSaveMidiMap,
    xbotControllerHandleMidiMessage: win.xbotControllerHandleMidiMessage,
  };
}

async function main() {
  check('XBOT_CONTROLLER_SLOTS is 8 (matches the 8 real Soundboard pads it dispatches to)', (function () {
    const m = src.match(/window\.XBOT_CONTROLLER_SLOTS\s*=\s*(\d+);/);
    return m && Number(m[1]) === 8;
  })());
  check('the action registry contains ONLY real, already-wired actions (sound:1..8 + noise), nothing fabricated', (function () {
    const m = src.match(/window\.XBOT_CONTROLLER_ACTIONS\s*=\s*\[([\s\S]*?)\];/);
    if (!m) return false;
    const values = (m[1].match(/value:\s*'([^']*)'/g) || []).map(function (v) { return v.replace(/value:\s*'/, '').replace(/'$/, ''); });
    const expected = ['', 'sound:1', 'sound:2', 'sound:3', 'sound:4', 'sound:5', 'sound:6', 'sound:7', 'sound:8', 'noise'];
    return JSON.stringify(values) === JSON.stringify(expected);
  })());

  // ── map load/save/set round-trip ──
  {
    const sb = makeSandbox();
    check('loadMap with nothing stored returns an empty object', JSON.stringify(sb.xbotControllerLoadMap()) === '{}');
    sb.xbotControllerSetPadAction(3, 'sound:2');
    check('setPadAction(3, "sound:2") persists to the real pflx_xbot_controller_map key', sb.localStore.pflx_xbot_controller_map === JSON.stringify({ 3: 'sound:2' }));
    sb.xbotControllerSetPadAction(3, '');
    check('setPadAction with an empty action REMOVES the slot rather than storing a dead mapping', sb.xbotControllerLoadMap()[3] === undefined);
  }
  {
    const sb = makeSandbox();
    sb.localStore.pflx_xbot_controller_map = 'not valid json {{{';
    check('loadMap with corrupted stored JSON fails safe to an empty object, not a throw', JSON.stringify(sb.xbotControllerLoadMap()) === '{}');
  }

  // ── firePad: dispatches to the REAL Soundboard/NoiseMeter bridges,
  // never to a fabricated action, never on an unassigned pad ──
  {
    const sb = makeSandbox();
    sb.xbotControllerSetPadAction(1, 'sound:5');
    const fired = sb.xbotControllerFirePad(1);
    check('firing a sound-assigned pad calls the REAL xbotSoundboardPlay with the right pad number', sb.soundboardPlayCalls.length === 1 && sb.soundboardPlayCalls[0] === 5);
    check('firePad returns true when an action actually ran', fired === true);
  }
  {
    const sb = makeSandbox();
    sb.xbotControllerSetPadAction(2, 'noise');
    sb.xbotControllerFirePad(2);
    check('firing a noise-assigned pad calls the REAL mcToggleNoiseMeter, no separate noise system invented', sb.noiseToggleCalls.length === 1);
  }
  {
    const sb = makeSandbox();
    const fired = sb.xbotControllerFirePad(4);
    check('firing an unassigned pad is a safe no-op -- no phantom sound, no phantom noise toggle', sb.soundboardPlayCalls.length === 0 && sb.noiseToggleCalls.length === 0);
    check('firePad returns false for an unassigned pad', fired === false);
  }

  // ── renderGrid: 8 pads, honest MIDI support/unsupported toggling ──
  {
    const sb = makeSandbox({ navigator: undefined }); // Node has no navigator -- the honest "unsupported" case
    sb.xbotControllerSetPadAction(6, 'sound:1');
    sb.xbotControllerRenderGrid();
    check('renderGrid renders exactly 8 pads', (sb.grid.innerHTML.match(/xbot-ctrl-pad-trigger/g) || []).length === 8);
    check('an assigned pad (6) shows the assigned styling class', sb.grid.innerHTML.indexOf('xbot-ctrl-pad xbot-ctrl-pad-assigned') !== -1);
    check('an assigned pad is clickable via the real xbotControllerFirePad(6) call', sb.grid.innerHTML.indexOf('xbotControllerFirePad(6)') !== -1);
    check('with no navigator.requestMIDIAccess, the UI honestly shows the unsupported message and hides the connect UI', sb.unsupEl.style.display === 'block' && sb.supEl.style.display === 'none');
    check('with MIDI unsupported, no per-pad "Learn" button is offered (nothing to learn against)', sb.grid.innerHTML.indexOf('🎹 Learn') === -1);
  }
  {
    const fakeNavigator = { requestMIDIAccess: function () { return Promise.resolve({ inputs: new Map() }); } };
    const sb = makeSandbox({ navigator: fakeNavigator });
    check('xbotControllerMidiSupported() correctly detects a real requestMIDIAccess function', sb.xbotControllerMidiSupported() === true);
    sb.xbotControllerRenderGrid();
    check('with MIDI supported, the UI shows the connect controls and hides the unsupported message', sb.supEl.style.display === 'block' && sb.unsupEl.style.display === 'none');
    check('with MIDI supported, each pad offers a real Learn button wired to xbotControllerStartLearn', sb.grid.innerHTML.indexOf('xbotControllerStartLearn(1)') !== -1);
  }
  {
    const sb = makeSandbox({ navigator: undefined });
    check('xbotControllerMidiSupported() is honestly false with no navigator.requestMIDIAccess (matches Safari/Firefox reality)', sb.xbotControllerMidiSupported() === false);
  }

  // ── connectMidi: never claims support it doesn't have ──
  {
    const sb = makeSandbox({ navigator: undefined });
    const result = await sb.xbotControllerConnectMidi();
    check('connectMidi() on an unsupported browser resolves null rather than throwing or faking a connection', result === null);
  }
  {
    const fakeNavigator = { requestMIDIAccess: function () { return Promise.resolve({ inputs: new Map([['dev-1', { id: 'dev-1', name: 'Launchpad Mini' }]]) }); } };
    const sb = makeSandbox({ navigator: fakeNavigator });
    const access = await sb.xbotControllerConnectMidi();
    check('connectMidi() on a supported browser resolves the real MIDIAccess object from requestMIDIAccess', access && access.inputs && access.inputs.get('dev-1').name === 'Launchpad Mini');
    check('connectMidi() populates the real device picker with the connected device', sb.midiSelect.innerHTML.indexOf('Launchpad Mini') !== -1);
  }

  // ── the MIDI message parser/dispatcher: pure, testable without real
  // hardware. Verifies note-on filtering, learn-mode mapping, and
  // dispatch-to-firePad, using synthetic MIDIMessageEvent.data-shaped
  // byte arrays. ──
  {
    const sb = makeSandbox();
    sb.xbotControllerSetPadAction(3, 'sound:7');
    const handled = sb.xbotControllerHandleMidiMessage('device-a', [0x90, 60, 100]); // note-on, note 60, velocity 100
    check('an unmapped note-on with no learn mode active is a safe no-op', handled === false);
    check('an unmapped note never fires a pad it has no mapping for', sb.soundboardPlayCalls.length === 0);
  }
  {
    const sb = makeSandbox();
    sb.xbotControllerSetPadAction(3, 'sound:7');
    sb.xbotControllerStartLearn(3);
    const learned = sb.xbotControllerHandleMidiMessage('device-a', [0x90, 60, 100]);
    check('a note-on received while learning maps that note to the learning pad', learned === true);
    check('the learned mapping is persisted per-device in the real pflx_xbot_midi_map key', sb.xbotControllerLoadMidiMap()['device-a'][60] === 3);
    check('learn mode clears itself after one successful learn (not stuck listening forever)', (function () {
      // fire the SAME note again -- since learn mode should now be off,
      // this should dispatch (fire pad 3's real action) instead of re-learning
      sb.xbotControllerHandleMidiMessage('device-a', [0x90, 60, 100]);
      return sb.soundboardPlayCalls.length === 1 && sb.soundboardPlayCalls[0] === 7;
    })());
  }
  {
    const sb = makeSandbox();
    sb.xbotControllerSetPadAction(5, 'noise');
    const midiMap = {};
    midiMap['device-b'] = { 44: 5 };
    sb.xbotControllerSaveMidiMap(midiMap);
    const dispatched = sb.xbotControllerHandleMidiMessage('device-b', [0x90, 44, 90]);
    check('a previously-learned mapping dispatches straight to the real firePad, same as a click', dispatched === true && sb.noiseToggleCalls.length === 1);
  }
  {
    const sb = makeSandbox();
    check('a note-OFF message (velocity 0) is correctly ignored, not treated as a trigger', sb.xbotControllerHandleMidiMessage('device-a', [0x90, 60, 0]) === false);
    check('a non-note-on status byte (e.g. control change 0xB0) is correctly ignored', sb.xbotControllerHandleMidiMessage('device-a', [0xB0, 7, 100]) === false);
    check('malformed/short MIDI data is a safe no-op, not a crash', sb.xbotControllerHandleMidiMessage('device-a', [0x90]) === false);
  }
  {
    // the same physical note number on two DIFFERENT devices must map
    // independently -- a device id collision would silently cross-wire
    // two different controllers' pads.
    const sb = makeSandbox();
    sb.xbotControllerSetPadAction(1, 'sound:1');
    sb.xbotControllerSetPadAction(2, 'sound:2');
    sb.xbotControllerStartLearn(1);
    sb.xbotControllerHandleMidiMessage('launchpad', [0x90, 36, 100]);
    sb.xbotControllerStartLearn(2);
    sb.xbotControllerHandleMidiMessage('apc-mini', [0x90, 36, 100]);
    sb.xbotControllerHandleMidiMessage('launchpad', [0x90, 36, 100]);
    sb.xbotControllerHandleMidiMessage('apc-mini', [0x90, 36, 100]);
    check('the SAME note number on two different devices maps to two DIFFERENT pads, not cross-wired',
      sb.soundboardPlayCalls.length === 2 && sb.soundboardPlayCalls[0] === 1 && sb.soundboardPlayCalls[1] === 2);
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
