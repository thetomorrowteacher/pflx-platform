// PATCH PLATFORM v201: Ennis -- "this will be the official loading screen
// music across all PFLX for all users". Extracts the real
// _pickLoadingMusicTrack from preview.html and runs it against fake SE configs.
const fs = require('fs'); const vm = require('vm');
const src = fs.readFileSync(process.argv[2], 'utf8');
let pass = 0, fail = 0;
function check(l, c) { if (c) { pass++; console.log('PASS: ' + l); } else { fail++; console.log('FAIL: ' + l); } }
check('PFLX_PATCH bumped to 201', src.indexOf('window.PFLX_PATCH   = 201;') !== -1);
const OFF = '/public/sounds/pflx-library/10_Music_Loops/loop_calm_8bar_orbit_drift_129bpm.mp3';
check('official track constant defined in the first script', src.indexOf("window.PFLX_OFFICIAL_LOADING_TRACK = {") !== -1 && src.indexOf("url: '" + OFF + "'") !== -1 && src.indexOf('PFLX_OFFICIAL_LOADING_TRACK') < src.indexOf('<style>'));
const a = src.indexOf('            _pickLoadingMusicTrack() {');
const b = src.indexOf('            _playAmbientPad() {', a);
const method = src.slice(a, b).trim().replace(/,\s*$/, '');
function pick(official, lm) {
  const ctx = { window: {}, SE: { config: { loadingMusic: lm } } };
  ctx.window.PFLX_OFFICIAL_LOADING_TRACK = official;
  vm.createContext(ctx);
  return vm.runInContext('var SE = this.SE; var o = {_loadingMusicShuffleBag: [], _loadingMusicLastIdx: -1, ' + method + '}; o._pickLoadingMusicTrack()', ctx);
}
const off = { id: 'x', name: 'Orbit', url: OFF };
const upload = { id: 'lm-1', name: 'mine.mp3', dataUrl: 'data:audio/mp3;base64,AA' };
check('empty gallery -> official track', (pick(off, { enabled: true, tracks: [] }) || {}).url === OFF);
check('host-uploaded gallery tracks no longer override it', [1,2,3,4,5].every(() => (pick(off, { enabled: true, shuffle: true, tracks: [upload] }) || {}).url === OFF));
check('no loadingMusic config at all (fresh player) -> official track', (pick(off, undefined) || {}).url === OFF);
check('host global Loading Music switch OFF still silences it', pick(off, { enabled: false, tracks: [] }) === null);
check('without the constant, old gallery behaviour is unchanged', (pick(undefined, { enabled: true, shuffle: false, tracks: [upload] }) || {}).id === 'lm-1');
check('playLoadingSfx still gates on player muteAll', /playLoadingSfx\(\) \{\s*try \{\s*if \(SE && \(SE\.playerPrefs && SE\.playerPrefs\.muteAll\)\) return;/.test(src));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
