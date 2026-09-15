// Unit tests for PATCH PLATFORM v199: Ennis -- "Can you add this sound
// library to PFLX. Allow the ability to save sound packs to save and
// choose to load up the midi and soundboards". Extracts the REAL shipped
// code out of preview.html (string-marker extraction, never a
// reimplementation) and runs it in a vm sandbox with in-memory
// localStorage / IndexedDB / Audio / Supabase fakes.
// Usage: node test_sound_packs_v199.js preview.html [public/sounds/pflx-library/manifest.json]
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(process.argv[2], 'utf8');
const manifestPath = process.argv[3] || 'public/sounds/pflx-library/manifest.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log('PASS: ' + label); }
  else { fail++; console.log('FAIL: ' + label); }
}
function between(str, a, b) {
  const i = str.indexOf(a);
  if (i === -1) throw new Error('start marker not found: ' + a);
  const j = str.indexOf(b, i);
  if (j === -1) throw new Error('end marker not found: ' + b);
  return str.slice(i, j);
}

// ── Markup / wiring ──
check('PFLX_PATCH bumped to 199', src.indexOf('window.PFLX_PATCH   = 199;') !== -1);
check('Sound panel has the pack bar container', src.indexOf('id="xbot-pack-bar-sound"') !== -1);
check('Controller panel has the pack bar container', src.indexOf('id="xbot-pack-bar-ctrl"') !== -1);
check('Sound toolbar: library button, stop all, pad volume', /xbotSoundboardBrowseLibrary\(\)[\s\S]{0,300}xbotSoundboardStopAll\(\)[\s\S]{0,400}id="xbot-sound-vol"/.test(src));
check('MIDI learn hint element present', src.indexOf('<div id="xbot-midi-learn-hint"></div>') !== -1);
check('Sound Engine gets the PFLX SOUND LIBRARY card in BOTH the live builder and the boot markup', src.split('seOpenSoundLibrary()').length - 1 === 2);
check('library modal sits above dock + loading screen', /\.pflx-soundlib-modal \{[^}]*z-index: 200000/.test(src));
check('Stop All is a controller action', src.indexOf("{ value: 'stopall', label: '⏹ Stop All Sounds' }") !== -1);
check('library base path is the static /public folder', src.indexOf("window.PFLX_SOUNDLIB_BASE = '/public/sounds/pflx-library/';") !== -1);
check('manifest has 285 clips', manifest.clips.length === 285);

// ── Sandbox ──
function makeEnv() {
  const store = {};
  const idb = {};
  const audios = [];
  const upserts = [];
  const cloud = { row: null, readError: null };
  const win = {};
  win.window = win;
  win.console = { log() {}, warn() {} };
  win.setTimeout = () => 0; win.clearTimeout = () => {};
  win.Promise = Promise; win.JSON = JSON; win.Math = Math; win.Date = Date; win.Object = Object; win.String = String; win.Array = Array; win.parseInt = parseInt; win.parseFloat = parseFloat; win.isNaN = isNaN;
  win.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  win.document = {
    getElementById: () => null,
    querySelectorAll: () => [],
    querySelector: () => null,
    activeElement: null,
    createElement: () => ({ addEventListener() {}, style: {} }),
    addEventListener() {},
    body: { appendChild() {} }
  };
  win.navigator = {};
  win.Audio = function (s) { this.src = s; this.paused = true; this.loop = false; this.volume = 1; audios.push(this); };
  win.Audio.prototype.play = function () { this.paused = false; return Promise.resolve(); };
  win.Audio.prototype.pause = function () { this.paused = true; };
  win.escapeHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  win.pflxDBAudioSave = (k, v) => { idb[k] = v; return Promise.resolve(); };
  win.pflxDBAudioLoad = k => Promise.resolve(k in idb ? idb[k] : null);
  win.pflxDBAudioDelete = k => { delete idb[k]; return Promise.resolve(); };
  win.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(manifest) });
  win.pflxSupabase = () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(cloud.readError ? { error: cloud.readError } : { data: cloud.row ? { data: cloud.row } : null }) }) }),
      upsert: (row) => { upserts.push(row); cloud.row = row.data; return Promise.resolve({ error: null }); }
    })
  });
  vm.createContext(win);
  return { win, store, idb, audios, upserts, cloud };
}
const block = between(src, '        window.XBOT_SOUNDBOARD_SLOTS = 8;', '        function switchXBotMode(mode) {');
function boot() {
  const env = makeEnv();
  vm.runInContext(block, env.win);
  env.win.pflxSoundLibIndex(manifest.clips);
  return env;
}
const tick = () => new Promise(r => setImmediate(r));
async function settle() { for (let i = 0; i < 8; i++) await tick(); }

(async function () {
  // Library helpers
  {
    const { win } = boot();
    const f = win.pflxSoundLibFilter;
    check('filter: category only', f(manifest.clips, '', '10_Music_Loops').length === 24);
    check('filter: multi-word search across name + source', f(manifest.clips, 'orbit hit', '').some(c => c.id === 'sting_hit_orbit_arcade') && f(manifest.clips, 'orbit hit', '').every(c => /orbit/i.test(c.n + c.s) && /hit/i.test(c.n + c.id)));
    check('filter: no match returns empty', f(manifest.clips, 'zzzz', '').length === 0);
    check('filter: tolerates junk input', f([null, { id: 'x', c: 'a' }], '', '').length === 1);
    const url = win.pflxSoundLibUrl(win._pflxSoundLibById['click_001']);
    check('clip url = base + category + id.mp3', url === '/public/sounds/pflx-library/01_UI_Clicks/click_001.mp3');
    check('every built-in pack clip exists in the manifest',
      win.PFLX_BUILTIN_SOUND_PACKS.every(bp => bp.clips.length === 8 && bp.clips.every(id => !!win._pflxSoundLibById[id])));
    check('unknown category falls back gracefully', win.pflxSoundLibCat('nope').label === 'nope');
  }

  // Soundboard pads
  {
    const { win, audios, idb } = boot();
    check('assign rejects pad 0 and pad 9', !win.xbotSoundboardAssignClip(0, win._pflxSoundLibById.click_001) && !win.xbotSoundboardAssignClip(9, win._pflxSoundLibById.click_001));
    check('assign rejects a missing clip', !win.xbotSoundboardAssignClip(1, null));
    win.xbotSoundboardAssignClip(1, win._pflxSoundLibById.click_001);
    win.xbotSoundboardAssignClip(2, win._pflxSoundLibById.loop_drive_8bar_orbit_arcade_134bpm);
    const meta = win.xbotSoundboardLoadMeta();
    check('library pad stores url + clipId + category', meta[1].url.endsWith('/click_001.mp3') && meta[1].clipId === 'click_001' && meta[1].cat === '01_UI_Clicks' && meta[1].src === 'library');
    check('loop clip marks the pad as looping', meta[2].loop === true && meta[1].loop === false);
    await win.xbotSoundboardPlay(1);
    check('library pad plays straight from its URL', audios.length === 1 && audios[0].src === meta[1].url && !audios[0].paused);
    await win.xbotSoundboardPlay(2);
    check('loop pad plays with audio.loop = true', audios[1].loop === true && !!win._xbotPadAudio[2]);
    await win.xbotSoundboardPlay(2);
    check('second hit on a looping pad stops it', audios[1].paused && !win._xbotPadAudio[2] && audios.length === 2);
    win.xbotSoundboardSetVolume(0.3);
    check('pad volume persists and clamps', win.xbotSoundboardGetVolume() === 0.3 && (win.xbotSoundboardSetVolume(5), win.xbotSoundboardGetVolume() === 1));
    await win.xbotSoundboardPlay(2);
    win.xbotSoundboardStopAll();
    check('STOP ALL silences every pad', Object.keys(win._xbotPadAudio).length === 0 && audios[2].paused);
    idb['xbot_pad_3'] = 'data:audio/mp3;base64,AAA';
    const m2 = win.xbotSoundboardLoadMeta(); m2[3] = { name: 'mine.mp3', src: 'upload' }; win.xbotSoundboardSaveMeta(m2);
    await win.xbotSoundboardPlay(3);
    check('uploaded pad still plays from IndexedDB', audios[audios.length - 1].src === 'data:audio/mp3;base64,AAA');
    check('empty pad plays nothing', (await win.xbotSoundboardPlay(7)) === false);
    const nAud = audios.length;
    win.document.getElementById = id => (id === 'pflx-loading-screen' ? { classList: { contains: c => c === 'active' } } : null);
    check('v198 guard kept: no pad starts while a loading screen is up', (await win.xbotSoundboardPlay(1)) === false && audios.length === nAud);
    win.document.getElementById = () => null;
    await win.xbotSoundboardClear(3);
    check('clear removes pad meta and its blob', !win.xbotSoundboardLoadMeta()[3] && !('xbot_pad_3' in idb));
  }

  // Merge (persistence guardrail)
  {
    const { win } = boot();
    const M = win.pflxSoundPacksMerge;
    const a = { packs: [{ id: 'p1', name: 'B', updatedAt: 10 }, { id: 'p2', name: 'A', updatedAt: 5 }], tombstones: {} };
    const b = { packs: [{ id: 'p1', name: 'B-new', updatedAt: 20 }, { id: 'p3', name: 'C', updatedAt: 1 }], tombstones: {} };
    const r = M(a, b);
    check('merge unions packs from both sides', r.packs.length === 3);
    check('merge keeps the newer copy of the same pack', r.packs.find(p => p.id === 'p1').name === 'B-new');
    check('merge: a stale copy never reverts a newer one (order-independent)', M(b, a).packs.find(p => p.id === 'p1').name === 'B-new');
    const t = M(a, { packs: [], tombstones: { p2: 6 } });
    check('tombstone drops an older pack (no resurrection)', !t.packs.some(p => p.id === 'p2') && t.tombstones.p2 === 6);
    const t2 = M({ packs: [{ id: 'p2', name: 'A again', updatedAt: 9 }], tombstones: {} }, { packs: [], tombstones: { p2: 6 } });
    check('a pack re-saved after its delete survives', t2.packs.some(p => p.id === 'p2'));
    check('merge keeps the newest tombstone time', M({ tombstones: { x: 3 } }, { tombstones: { x: 8 } }).tombstones.x === 8);
    check('built-in ids are never stored as user packs', M({ packs: [{ id: 'builtin-starter', updatedAt: 1 }] }, null).packs.length === 0);
    check('merge survives null / malformed rows', M(null, 'junk').packs.length === 0);
    check('packs sorted by name', r.packs.map(p => p.name).join(',') === 'A,B-new,C');
  }

  // Save / capture / load / delete
  {
    const { win, idb, upserts, cloud } = boot();
    win._xbotMidiNameById = { 'dev-123': 'Akai MPK Mini' };
    win.xbotSoundboardAssignClip(1, win._pflxSoundLibById.sting_hit_orbit_arcade);
    idb['xbot_pad_2'] = 'data:audio/wav;base64,UP';
    const m = win.xbotSoundboardLoadMeta(); m[2] = { name: 'bell.wav', src: 'upload' }; win.xbotSoundboardSaveMeta(m);
    win.xbotControllerSetPadAction(1, 'sound:1');
    win.xbotControllerSetPadAction(8, 'stopall');
    win.xbotControllerSaveMidiMap({ 'dev-123': { 36: 1, 43: 8 } });
    cloud.row = { packs: [{ id: 'pack-other', name: 'Other host pack', updatedAt: 5 }], tombstones: {} };
    const pack = await win.pflxSoundPackSave('  Period 3 Showdown  ');
    await settle();
    check('save trims the name and returns the pack', pack && pack.name === 'Period 3 Showdown' && /^pack-/.test(pack.id));
    check('pack captures library pad by URL', pack.pads[1].url.endsWith('sting_hit_orbit_arcade.mp3') && pack.pads[1].src === 'library');
    check('pack captures uploaded pad by IndexedDB key (no audio in the row)', pack.pads[2].src === 'upload' && pack.pads[2].blobKey === 'xbot_packpad_' + pack.id + '_2' && !JSON.stringify(pack).includes('base64'));
    check('uploaded audio copied under the pack key', idb['xbot_packpad_' + pack.id + '_2'] === 'data:audio/wav;base64,UP');
    check('pack captures controller actions', pack.controller[1] === 'sound:1' && pack.controller[8] === 'stopall');
    check('pack captures MIDI by device name AND id', pack.midi.byName['Akai MPK Mini'][36] === 1 && pack.midi.byId['dev-123'][43] === 8);
    check('save becomes the active, unmodified pack', JSON.parse(win.localStorage.getItem('pflx_xbot_active_pack')).id === pack.id && !JSON.parse(win.localStorage.getItem('pflx_xbot_active_pack')).dirty);
    check('push is read-merge-write: other host\'s pack kept, ours added', upserts.length === 1 && upserts[0].key === 'pflx_sound_packs' && upserts[0].data.packs.length === 2);
    check('local store picks up the other host\'s pack after push', win.pflxSoundPacksLocal().packs.length === 2);
    win.pflxSoundPackMarkDirty();
    check('editing after load marks the pack modified', JSON.parse(win.localStorage.getItem('pflx_xbot_active_pack')).dirty === true);

    // wipe the board, then load back pads only
    await win.xbotSoundboardClear(1); await win.xbotSoundboardClear(2);
    win.xbotControllerSaveMap({ 3: 'noise' });
    const ok1 = await win.pflxSoundPackLoad(pack.id, { pads: true, controller: false, midi: false });
    const mm = win.xbotSoundboardLoadMeta();
    check('load(pads only) restores library + uploaded pads', ok1 === true && mm[1].clipId === 'sting_hit_orbit_arcade' && mm[2].name === 'bell.wav' && !mm[2].missing);
    check('uploaded pad blob restored to its slot', idb['xbot_pad_2'] === 'data:audio/wav;base64,UP');
    check('load(pads only) leaves the controller alone', JSON.stringify(win.xbotControllerLoadMap()) === JSON.stringify({ 3: 'noise' }));
    // another computer: different MIDI id, same device name
    win._xbotMidiNameById = { 'other-id-9': 'Akai MPK Mini' };
    win.xbotControllerSaveMidiMap({});
    await win.pflxSoundPackLoad(pack.id, { pads: false, controller: true, midi: true });
    const mid = win.xbotControllerLoadMidiMap();
    check('load(controller) restores pad actions', win.xbotControllerLoadMap()[8] === 'stopall');
    check('load(midi) maps by name onto this computer\'s device id', mid['other-id-9'] && mid['other-id-9'][36] === 1 && mid['name:Akai MPK Mini'][43] === 8);
    // missing blob (pack opened on a device that never had the upload)
    delete idb['xbot_packpad_' + pack.id + '_2'];
    await win.pflxSoundPackLoad(pack.id, { pads: true, controller: false, midi: false });
    check('upload pad without its file is flagged missing, not dropped', win.xbotSoundboardLoadMeta()[2].missing === true);
    check('loading an unknown pack is a no-op', (await win.pflxSoundPackLoad('nope')) === false);

    // delete
    const before = upserts.length;
    check('built-in packs cannot be deleted', win.pflxSoundPackDelete('builtin-starter') === false);
    check('delete returns true for a saved pack', win.pflxSoundPackDelete(pack.id) === true);
    await settle();
    const s = win.pflxSoundPacksLocal();
    check('delete writes a tombstone and clears active', !s.packs.some(p => p.id === pack.id) && s.tombstones[pack.id] > 0 && win.localStorage.getItem('pflx_xbot_active_pack') === null);
    check('delete pushes, and the cloud row keeps the other pack', upserts.length === before + 1 && cloud.row.packs.length === 1 && cloud.row.packs[0].id === 'pack-other' && cloud.row.tombstones[pack.id] > 0);
    check('delete removes the pack\'s stored upload copies', !Object.keys(idb).some(k => k.indexOf('xbot_packpad_' + pack.id) === 0));
    // stale cloud copy still holding the deleted pack must not resurrect it
    cloud.row = { packs: [pack, { id: 'pack-other', name: 'Other host pack', updatedAt: 5 }], tombstones: {} };
    await win.pflxSoundPacksPull();
    check('pull from a stale cloud row does not resurrect a deleted pack', !win.pflxSoundPacksLocal().packs.some(p => p.id === pack.id));
    // cloud read failure: never blind-write
    cloud.readError = { message: 'boom' };
    const n = upserts.length;
    await win.pflxSoundPacksPush();
    check('push does not write when the cloud read fails', upserts.length === n);
  }

  // Built-in packs
  {
    const { win } = boot();
    win.xbotControllerSaveMidiMap({ keep: { 40: 2 } });
    const ok = await win.pflxSoundPackLoad('builtin-friday-showdown', { pads: true, controller: true, midi: true });
    const meta = win.xbotSoundboardLoadMeta();
    check('built-in pack loads all 8 pads', ok === true && Object.keys(meta).length === 8 && meta[1].clipId === 'sting_intro_orbit_arcade');
    check('built-in pack maps controller pads 1-8 to soundboard pads', [1, 2, 3, 4, 5, 6, 7, 8].every(i => win.xbotControllerLoadMap()[i] === 'sound:' + i));
    check('built-in pack (no MIDI) keeps the host\'s MIDI mappings', win.xbotControllerLoadMidiMap().keep[40] === 2);
    check('built-in packs are read-only for SAVE', (await win.pflxSoundPackUpdateSelected()) === null);
    const env2 = makeEnv();
    env2.win.fetch = () => Promise.reject(new Error('offline'));
    vm.runInContext(block, env2.win);
    env2.win.xbotSoundboardAssignClip = env2.win.xbotSoundboardAssignClip; // unchanged
    const keep = { 5: { name: 'keep me', src: 'upload' } };
    env2.win.xbotSoundboardSaveMeta(keep);
    const ok2 = await env2.win.pflxSoundPackLoad('builtin-starter', { pads: true, controller: true, midi: true });
    check('offline: built-in load changes nothing', ok2 === false && env2.win.xbotSoundboardLoadMeta()[5].name === 'keep me');
    check('parts default to all three', JSON.stringify(win.pflxSoundPackParts()) === JSON.stringify({ pads: true, controller: true, midi: true }));
    win.pflxSoundPackSetPart('midi', false);
    check('part toggles persist', win.pflxSoundPackParts().midi === false && win.pflxSoundPackParts().pads === true);
    win.pflxSoundPackSetPart('pads', false); win.pflxSoundPackSetPart('controller', false);
    check('load with nothing ticked does nothing', (await win.pflxSoundPackLoadSelected()) === false);
  }

  // MIDI
  {
    const { win, audios } = boot();
    win._xbotMidiNameById = { a1: 'Launchpad' };
    win.xbotSoundboardAssignClip(4, win._pflxSoundLibById.blip_002);
    win.xbotControllerSetPadAction(2, 'sound:4');
    win.xbotControllerSetPadAction(6, 'stopall');
    win._xbotMidiLearnSlot = 2;
    check('learn consumes a note-on', win.xbotControllerHandleMidiMessage('a1', [0x90, 60, 100]) === true && win._xbotMidiLearnSlot === null);
    const mm = win.xbotControllerLoadMidiMap();
    check('learn stores the note by device id and by device name', mm.a1[60] === 2 && mm['name:Launchpad'][60] === 2);
    check('note-off (velocity 0) is ignored', win.xbotControllerHandleMidiMessage('a1', [0x90, 60, 0]) === false);
    check('non note-on status ignored', win.xbotControllerHandleMidiMessage('a1', [0x80, 60, 100]) === false);
    check('mapped note fires the pad', win.xbotControllerHandleMidiMessage('a1', [0x90, 60, 90]) === true);
    await settle();
    check('... which plays soundboard pad 4', audios.length === 1 && audios[0].src.endsWith('blip_002.mp3'));
    win._xbotMidiNameById.b7 = 'Launchpad';
    check('same controller under a new id resolves by name', win.xbotControllerHandleMidiMessage('b7', [0x91, 60, 90]) === true);
    check('unknown device + unknown note does nothing', win.xbotControllerHandleMidiMessage('zz', [0x90, 61, 90]) === false);
    check('stopall action fires', win.xbotControllerFirePad(6) === true);
    const notes = win.xbotControllerNotesBySlot();
    check('notes-by-slot de-duplicates id + name entries', JSON.stringify(notes[2]) === JSON.stringify(['60']));
  }

  // Sound Engine library hooks + cloud subset tombstones
  {
    const { win } = boot();
    const SE = { config: { tracks: [], sfx: [] } };
    vm.runInContext('var SE = this.__SE; var seHostSaveCalls = 0; function seHostSave(){ seHostSaveCalls++; }', Object.assign(win, { __SE: SE }));
    const c = win._pflxSoundLibById.drone_002;
    check('seAddLibraryTrack adds a URL track', win.seAddLibraryTrack(c) === true && SE.config.tracks[0].url.endsWith('drone_002.mp3') && SE.config.tracks[0].addedAt > 0);
    check('seAddLibraryTrack refuses a duplicate', win.seAddLibraryTrack(c) === false && SE.config.tracks.length === 1);
    check('seAddLibrarySfx assigns to the chosen event', win.seAddLibrarySfx(win._pflxSoundLibById.blip_002, 'level-up') === true && SE.config.sfx[0].event === 'level-up' && SE.config.sfx[0].dataUrl === '');
    check('same clip can serve a different event', win.seAddLibrarySfx(win._pflxSoundLibById.blip_002, 'nav') === true && SE.config.sfx.length === 2);
    check('host save ran for each add', vm.runInContext('seHostSaveCalls', win) === 3);
  }
  {
    const seBlock = between(src, '        function _seCloudSubset() {', '        function seHostSave() {');
    const ctx = { console: { warn() {} }, localStorage: { setItem() {} }, window: {} };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext('var SE = { config: { tracks: [], sfx: [], loadingMusic: { tracks: [] } } };' + seBlock + '; this.SE = SE; this._seCloudSubset = _seCloudSubset; this._seApplyCloud = _seApplyCloud; this.seNoteRemoved = seNoteRemoved;', ctx);
    const SE = ctx.SE;
    SE.config.sfx.push({ id: 'sfx-lib-nav-blip_002', event: 'nav', name: 'Blip', url: '/u/b.mp3', dataUrl: '', addedAt: 100 });
    SE.config.sfx.push({ id: 'sfx-up', event: 'nav', name: 'up', url: '', dataUrl: 'data:x' });
    let sub = ctx._seCloudSubset();
    check('cloud subset carries URL SFX only (never uploaded blobs)', sub._urlSfx.length === 1 && sub._urlSfx[0].event === 'nav' && !JSON.stringify(sub).includes('data:x'));
    const stale = JSON.parse(JSON.stringify(sub));
    ctx.seNoteRemoved(SE.config.sfx[0]);
    SE.config.sfx.splice(0, 1);
    sub = ctx._seCloudSubset();
    check('removing a URL SFX records a tombstone in the subset', sub._removed['sfx-lib-nav-blip_002'] > 0);
    ctx._seApplyCloud(stale);
    check('stale cloud copy does NOT resurrect the removed SFX', !SE.config.sfx.some(s => s.id === 'sfx-lib-nav-blip_002'));
    const readded = { id: 'sfx-lib-nav-blip_002', event: 'nav', name: 'Blip', url: '/u/b.mp3', dataUrl: '', addedAt: Date.now() + 1000 };
    ctx._seApplyCloud({ _urlSfx: [readded], _removed: {} });
    check('a clip re-added after the removal comes through', SE.config.sfx.some(s => s.id === 'sfx-lib-nav-blip_002'));
    ctx._seApplyCloud({ _urlSfx: [{ id: 'sfx-lib-error-x', event: 'error', name: 'X', url: '/u/x.mp3', addedAt: 5 }] });
    check('new URL SFX from another device are unioned in', SE.config.sfx.some(s => s.id === 'sfx-lib-error-x') && SE.config.sfx.some(s => s.id === 'sfx-up'));
    ctx._seApplyCloud({ _removed: { 'sfx-lib-error-x': 10 } });
    check('a removal made on another device applies here', !SE.config.sfx.some(s => s.id === 'sfx-lib-error-x'));
    check('uploaded (dataUrl) SFX are never touched by tombstones', SE.config.sfx.some(s => s.id === 'sfx-up'));
    SE.config.tracks.push({ id: 'old-url', name: 'o', url: '/o.mp3', dataUrl: '' });
    ctx._seApplyCloud({ _urlTracks: [], _removed: {} });
    check('existing URL tracks without tombstones are kept', SE.config.tracks.some(t => t.id === 'old-url'));
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('CRASH', e); process.exit(2); });
