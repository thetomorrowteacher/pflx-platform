// PATCH PLATFORM v209 -- X-Bot (dock, launcher, pop-outs) hidden during the intro video.
const fs = require('fs'); const vm = require('vm');
const src = fs.readFileSync(process.argv[2], 'utf8');
let pass = 0, fail = 0;
function check(l, c, x) { if (c) { pass++; console.log('PASS: ' + l); } else { fail++; console.log('FAIL: ' + l + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } }
check('PFLX_PATCH is at least 209', +((src.match(/window\.PFLX_PATCH\s+=\s+(\d+);/) || [])[1]) >= 209);
check('CSS hides dock, launcher, pop-outs and the theater chip while the intro plays',
  /body\.pflx-intro-playing #pflx-dock,\s*body\.pflx-intro-playing #pflx-dock-fab,\s*body\.pflx-intro-playing \.pflx-pip-widget,\s*body\.pflx-intro-playing #pflx-theater-live-chip \{ visibility:hidden !important; pointer-events:none !important; \}/.test(src));
const a = src.indexOf('        function playMotionIntro() {');
const b = src.indexOf('        function initLoginParticles() {', a);
const fn = src.slice(a, b);
function run(opts) {
  const cls = new Set();
  const timers = [];
  const video = { play: () => Promise.resolve(), pause() {}, onended: null };
  const container = { style: {} };
  const ctx = {
    window: { PFLX_AUDIO: { start() {}, stop() {} }, pflxIsLiteDevice: () => !!opts.lite },
    document: { getElementById: (id) => id === 'pflx-motion-intro' ? container : (id === 'pflx-motion-video' ? video : null),
      body: { classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c) } } },
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, Promise
  };
  vm.createContext(ctx);
  vm.runInContext(fn + '\nthis.p = playMotionIntro();', ctx);
  return { cls, timers, video, container };
}
let r = run({});
check('class is on while the intro plays', r.cls.has('pflx-intro-playing'));
r.video.onended(); r.timers.filter(t => t.ms === 1200).forEach(t => t.f());
check('class is removed when the intro ends', !r.cls.has('pflx-intro-playing'));
r = run({});
r.timers.filter(t => t.ms === 30000).forEach(t => t.f()); r.timers.filter(t => t.ms === 1200).forEach(t => t.f());
check('class is removed by the 30s safety path too', !r.cls.has('pflx-intro-playing'));
r = run({ lite: true });
check('lite devices (no intro) never get the class', !r.cls.has('pflx-intro-playing'));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
