// PATCH PLATFORM v233 -- Story Mode.
// Text assertions that the patch landed, plus a real run of the campaign
// logic (locking, progress, awards) pulled out of the page with vm.
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(process.argv[2] || 'preview.html', 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('PASS: ' + m); } else { fail++; console.log('FAIL: ' + m); } }

const pv = /window\.PFLX_PATCH\s*=\s*(\d+)/.exec(src);
ok(pv && +pv[1] >= 233, 'PFLX_PATCH >= 233');

ok(/<button class="nav-btn" data-view="story"/.test(src), 'toolbar has a Story Mode button');
ok(/<div class="view story-view"><div id="sm-root"><\/div><\/div>/.test(src), 'story view container exists');
ok(/'story':\s*'story-view'/.test(src), 'router maps story -> story-view');
ok(/if \(viewName === 'story'\) \{[\s\S]{0,200}pflxStoryBoot/.test(src), 'opening the view boots the campaign');
ok(/key:\s*'story',\s*name:\s*'Story Mode'/.test(src), 'Home App Hub has a Story Mode tile');
ok(/window\.PFLX_STORY_ART\s*=\s*'public\/story-art\/'/.test(src), 'art base points at public/story-art/');
ok(src.indexOf('PATCH PLATFORM v233') !== src.lastIndexOf('PATCH PLATFORM v233'), 'module is sentinel-wrapped');
ok(/\.sm-node\{/.test(src) && /\.sm-quad\{/.test(src), 'story css is inlined');
ok(/window\.PFLX_STORY\s*=\s*\{/.test(src), 'campaign data is inlined');
ok(/window\.PFLX_CLIENTS\s*=\s*\{/.test(src), 'client interview data is inlined');
ok(/PflxDataBus\.award\(pid\(\),\s*\{ xc: xc/.test(src), 'quest rewards route through PflxDataBus.award');
ok(/pflx_story_/.test(src), 'progress is keyed per player');
ok(/pflxCloudKvPush/.test(src) && /pflxCloudKvLoad/.test(src), 'progress syncs through the cloud KV helpers');
ok(/window\.navigateTo\('lite'\)/.test(src), 'the Showcase quest opens X-Live');
ok(/pflx_story_progress/.test(src), 'progress is broadcast to sub-apps');

// ── run the data + the pure campaign logic for real ──────────────────────
const dm = /window\.PFLX_STORY = \{[\s\S]*?\n\};/.exec(src);
ok(!!dm, 'campaign data block extractable');
if (dm) {
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(dm[0].replace(/^window\./, 'this.window.'), ctx);
  const D = ctx.window.PFLX_STORY;
  ok(D.acts.length === 7, 'seven acts (' + D.acts.length + ')');
  const qs = D.acts.reduce((a, x) => a.concat(x.quests), []);
  ok(qs.length === 28, '28 quests (' + qs.length + ')');
  ok(qs.every(q => q.xc > 0 && q.xp > 0 && q.mins > 0), 'every quest pays X-Coin and XP');
  const ids = qs.map(q => q.id);
  ok(new Set(ids).size === ids.length, 'quest ids are unique');
  const bad = qs.filter(q => (q.needs || []).some(n => ids.indexOf(n) < 0));
  ok(!bad.length, 'every prerequisite points at a real quest' + (bad.length ? ' [' + bad.map(b => b.id) + ']' : ''));
  const total = qs.reduce((a, q) => a + q.xc, 0);
  ok(total > 6000 && total < 12000, 'a full run pays ' + total + ' X-Coin');
  // no quest may depend on one that comes later
  let seen = {}, order = true;
  qs.forEach(q => { (q.needs || []).forEach(n => { if (!seen[n]) order = false; }); seen[q.id] = 1; });
  ok(order, 'prerequisites always come earlier in the campaign');
  ok(D.traits.length === 12, '12 trait statements');
  const kinds = new Set(qs.map(q => q.kind));
  ok(kinds.size >= 20, qs.length + ' quests across ' + kinds.size + ' distinct screen kinds');
}

const cm = /window\.PFLX_CLIENTS = \{[\s\S]*?\n?\};/.exec(src);
ok(!!cm, 'client data block extractable');
if (cm) {
  const ctx2 = { window: {} }; vm.createContext(ctx2);
  vm.runInContext(cm[0].replace(/^window\./, 'this.window.'), ctx2);
  const C = ctx2.window.PFLX_CLIENTS.clients;
  ok(C.length === 8, 'eight clients (' + C.length + ')');
  ok(C.every(c => c.questions.length === 8), 'eight interview questions each');
  const quadOk = C.every(c => ['says', 'thinks', 'does', 'feels']
    .every(k => c.questions.filter(q => q.reveals === k).length === 2));
  ok(quadOk, 'every client fills all four Empathy Map quadrants twice over');
  ok(C.every(c => c.sample_problem && c.problem_hint), 'every client has a problem hint and a model statement');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
