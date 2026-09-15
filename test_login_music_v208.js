// PATCH PLATFORM v208 -- the GalaxyMusic X theme is the official login music.
const fs = require('fs'); const vm = require('vm');
const src = fs.readFileSync(process.argv[2], 'utf8');
let pass = 0, fail = 0;
function check(l, c, x) { if (c) { pass++; console.log('PASS: ' + l); } else { fail++; console.log('FAIL: ' + l + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } }
const URL = '/public/sounds/pflx-theme/pflx_x_theme_galaxymusic.mp3';
check('PFLX_PATCH is at least 208', +((src.match(/window\.PFLX_PATCH\s+=\s+(\d+);/) || [])[1]) >= 208);
check('official login track constant in the first script', src.indexOf('window.PFLX_OFFICIAL_LOGIN_TRACK = {') !== -1 && src.indexOf("url: '" + URL + "'") !== -1 && src.indexOf('PFLX_OFFICIAL_LOGIN_TRACK') < src.indexOf('<style>'));
const a = src.indexOf('        function sePlayLoginMusic() {');
const b = src.indexOf('        // Autoplay-with-sound is blocked by browsers', a);
const fn = src.slice(a, b);
function run(official, cfg, prefs) {
  const played = [];
  const ctx = { window: { PFLX_OFFICIAL_LOGIN_TRACK: official }, played,
    SE: { config: Object.assign({ loginMusicEnabled: true, tabTracks: {}, tracks: [] }, cfg), playerPrefs: Object.assign({ muteAll: false, musicOn: true }, prefs),
      loginAudio: { play() { played.push(this.src); return Promise.resolve(); } } },
    seApplyVolumes() {}, seArmLoginMusicGestureRetry() {} };
  vm.createContext(ctx);
  vm.runInContext('var SE = this.SE; var played = this.played; var seApplyVolumes = this.seApplyVolumes; var seArmLoginMusicGestureRetry = this.seArmLoginMusicGestureRetry;' + fn + '\nsePlayLoginMusic();', ctx);
  return played;
}
const OFF = { id: 'x', name: 'X Theme', url: URL };
const lib = { id: 't1', name: 'Old', url: '/old.mp3' };
check('empty library -> theme plays', run(OFF, {}, {})[0] === URL);
check('a host per-tab login pick no longer overrides it', run(OFF, { tabTracks: { login: 't1' }, tracks: [lib] }, {})[0] === URL);
check('host Login Screen Music switch OFF still silences it', run(OFF, { loginMusicEnabled: false }, {}).length === 0);
check('player mute-all still silences it', run(OFF, {}, { muteAll: true }).length === 0);
check('player music-off still silences it', run(OFF, {}, { musicOn: false }).length === 0);
check('without the constant the old behaviour is unchanged', run(undefined, { tabTracks: { login: 't1' }, tracks: [lib] }, {})[0] === '/old.mp3');
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
