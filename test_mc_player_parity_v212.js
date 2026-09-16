// v212 -- MC Player Portal host parity (16:9 covers of any kind, pinned
// card-size slider) + Master Host Player Mode.
const fs = require('fs');
const vm = require('vm');
const file = process.argv[2] || 'preview.html';
const src = fs.readFileSync(file, 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('PASS: ' + m); } else { fail++; console.log('FAIL: ' + m); } }
function fnBody(name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    let d = 0, j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } }
    return '';
}
const m = /window\.PFLX_PATCH\s*=\s*(\d+)/.exec(src);
ok(m && +m[1] >= 212, 'PFLX_PATCH >= 212');

// Player renderers use the poster-card kit with the host's cover
['ppRenderPrograms', 'ppRenderCheckpoints', 'ppRenderProjects', 'ppRenderJobBoard', 'ppRenderMyTasks'].forEach(function (n) {
    const b = fnBody(n);
    ok(/ppCardShellOpen\(/.test(b) && /ppCoverHtml\(/.test(b), n + ': poster card with cover');
    ok(/pflxMhpmHiddenHtml\(/.test(b), n + ': honours Player Mode show toggles');
    ok(/pflxApplyCardSize\('pp\w+'\)/.test(b) && b.lastIndexOf('pflxApplyCardSize') > b.lastIndexOf('el.innerHTML = html'), n + ': card size applied after the list exists');
});
ok(/pflxCardSizeSliderHtml\('ppjobs'/.test(fnBody('ppRenderJobBoard')), 'player Job Board has a card-size slider');
ok(/ppCoverHtml\(t, \{[^}]*inherit: true/.test(fnBody('ppRenderMyTasks')), 'task cards borrow their project/checkpoint cover');
['ppHomeCheckpointCardHtml', 'ppHomeProjectCardHtml', 'ppHomeProgramCardHtml'].forEach(function (n) {
    const b = fnBody(n);
    ok(/ppCoverHtml\(/.test(b) && !/height:(90|120|170)px/.test(b), n + ': 16:9 cover, no fixed banner height');
});
ok(/if \(\(opts\.embed \|\| opts\.image\) && typeof pflxCoverMediaEl === 'function'\)/.test(fnBody('ppBannerHeader')), 'detail banner: images use the 16:9 frame too');
const cpd = fnBody('ppRenderCheckpointDetail');
ok(/if \(cp\.embedUrl\) \{[\s\S]*?ppBannerHeader\(\{[\s\S]*?embed: cp\.embedUrl/.test(cpd), 'checkpoint detail shows embed covers');
ok(/embed: activeCp\.embedUrl/.test(src), 'home hero passes the checkpoint embed');
ok(/embed: __tCov \? \(__tCov\.embedUrl/.test(fnBody('ppRenderTaskDetail')), 'task detail uses the nearest cover incl. embeds');

// Slider pinned + job keys
const sl = fnBody('pflxCardSizeSliderHtml');
ok(/class="pflx-card-size-bar"/.test(sl), 'slider carries the pinned bar class');
ok(/\.pflx-card-size-bar \{\s*position: sticky; top: 0;/.test(src), 'bar is position:sticky');
ok(/:is\(#mc-checkpoints-sizer, #mc-tasks-sizer, #mc-projects-sizer, #mc-seasons-sizer, #mc-programs-tab-sizer, #mc-jobs-sizer\) \{ position: sticky; top: 0;/.test(src), 'host sizers are sticky');
ok(/jobs: 380, ppjobs: 360 \}/.test(src) && /jobs: 'mc-jobs-list', ppjobs: 'ppmc-jobs-list' \}/.test(src), 'job board size keys');
ok(/<div id="mc-jobs-sizer"><\/div>/.test(src) && /minmax\(var\(--pflx-card-min, 380px\), 1fr\)/.test(fnBody('mcRenderJobs')), 'host job board slider + variable grid');

// Master Host Player Mode hooks
ok(/pflxMhpmCohorts\(\) : null; if \(__mh\) cohorts = __mh;/.test(fnBody('ppItemAssignedToActivePlayer')), 'assignment wrapper uses Master Host cohorts');
ok(/pflxMhpmDecorate\(container\)/.test(fnBody('mcRenderPlayerDashPreview')), 'portal shows the Player Mode bar');
ok(/pflxMhpmShows\('checkpoints'\)/.test(fnBody('ppRenderHome')) && /pflxMhpmShows\('programs'\)/.test(fnBody('ppRenderHome')), 'home rows honour show toggles');
ok(/'HOST MODE' : 'PLAYER MODE'/.test(src) && !/'HOST VIEW' : 'PLAYER VIEW'/.test(src), 'toolbar toggle reads HOST MODE / PLAYER MODE');

// Run the v212 module in a sandbox
const blk = /PATCH PLATFORM v212 — MC Player Portal[\s\S]*?<script>([\s\S]*?)<\/script>/.exec(src);
ok(!!blk, 'v212 module present');
if (!blk) { console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(1); }
const stored = {};
const writes = [];
const ctx = {
    console, setTimeout: function () {}, setInterval: function () {}, Date, JSON, Math, Promise, String, Array, Object, parseInt,
    localStorage: { getItem: () => null, setItem: () => {} },
    document: { readyState: 'complete', hidden: false, querySelectorAll: () => [], getElementById: () => null, addEventListener() {}, createElement: () => ({}) },
    mcCohortGroups: [{ id: 'cg-1', name: 'Falcon Studios' }],
    mcPlayers: [{ id: 'p1', cohort: 'Class A, Class B' }, { id: 'admin-1', role: 'admin', isHost: true, cohorts: ['N/A'] }],
    mcSeasons: [], mcJobs: [{ cohorts: ['Night Crew'] }],
    mcPrograms: [{ cohorts: ['cg-1'] }],
    mcCheckpoints: [{ id: 'cp1', assignedTo: ['Checkpoint Crew'], bannerImage: 'https://a.test/cp.png', taskIds: ['t9'] }],
    mcProjects: [{ id: 'pj1', checkpointId: 'cp1', taskIds: ['t1'], embedUrl: 'https://www.canva.com/design/X/view' }],
    mcTasks: [{ id: 't1', assignedTo: ['p1', 'cg-1', 'N/A'] }],
};
ctx.window = ctx;
ctx.pflxSupabase = function () {
    return { from: function () { return {
        select: function () { return { eq: function () { return { maybeSingle: async function () { return { data: { data: JSON.parse(JSON.stringify(stored)) } }; } }; } }; },
        upsert: async function (row) { writes.push(row.key); Object.keys(row.data).forEach(k => stored[k] = row.data[k]); return {}; }
    }; } };
};
ctx.pflxHostTier = function (s) { return s && s.role === 'admin' ? 'master' : null; };
ctx.pflxCoverMediaEl = function (e, im) { return e ? '<iframe id="x" src="' + e + '"></iframe>' : (im ? '<img src="' + im + '">' : ''); };
vm.createContext(ctx);
vm.runInContext(blk[1], ctx);
const C = ctx.pflxCoverMediaEl;
ok(/<video[^>]*muted[^>]*loop/.test(C('https://x.test/a.mp4', '')), 'mp4 -> muted looping video');
ok(/<video/.test(C('', 'https://h.supabase.co/storage/v1/object/public/pflx-theater/covers/b')), 'theater-bucket upload -> video');
ok((C('slideshow:https://a/1.jpg|https://a/2.jpg', '').match(/<img /g) || []).length === 2, 'slideshow -> 2 slides');
ok(/drive\.google\.com\/file\/d\/1234567890ab\/preview/.test(C('https://drive.google.com/file/d/1234567890ab/view', '')), 'Drive -> /preview');
ok(/<iframe loading="lazy" id="x"/.test(C('https://www.canva.com/design/X/view', '')), 'embeds lazy-load');
ok(C('', 'https://a/i.png') === '<img src="https://a/i.png">', 'image path unchanged');
ok(ctx.pflxCoverSlides('slideshow:javascript:alert(1)|https://a/1.jpg').length === 1, 'slideshow ignores non-http entries');

// task inherits the project's STILL art only (project has only an embed -> checkpoint image)
const tHtml = ctx.ppCoverHtml({ id: 't1', projectId: 'pj1' }, { inherit: true, title: 'T', icon: 'x' });
ok(/<img src="https:\/\/a\.test\/cp\.png"/.test(tHtml) && !/<iframe/.test(tHtml), 'inherited cover never mounts a live embed');
ok(/aspect-ratio|pp-cover/.test(tHtml), 'cover wrapper class');

// Master Host Player Mode
ctx.pflxRole = 'host';
ctx.activeSession = { id: 'admin-1', role: 'admin', cohorts: ['N/A'] };
ok(ctx.pflxMhpmActive() === false && ctx.pflxMhpmCohorts() === null, 'host mode: inactive');
ctx.pflxRole = 'player';
ok(ctx.pflxMhpmActive() === true, 'player mode + master tier: active');
ctx.pflxMimicIsActive = () => true;
ok(ctx.pflxMhpmActive() === false, 'mimicking a player: inactive');
ctx.pflxMimicIsActive = () => false;
const all = ctx.pflxMhpmCohorts();
ok(['Falcon Studios', 'Class A', 'Class B', 'Night Crew', 'Checkpoint Crew'].every(c => all.indexOf(c) !== -1), 'every cohort collected: ' + all.join('|'));
ok(all.indexOf('N/A') === -1 && all.indexOf('p1') === -1 && all.indexOf('cg-1') === -1, 'no N/A, player ids or raw group ids');
ctx.activeSession = { id: 'p1', role: 'player', cohort: 'Class A' };
ok(ctx.pflxMhpmActive() === false && ctx.pflxMhpmCohorts() === null, 'real player: inactive');
ok(ctx.pflxMhpmShows('tasks') === true && ctx.pflxMhpmHiddenHtml('tasks') === '', 'real player: nothing hidden');
(async function () {
    ctx.activeSession = { id: 'admin-1', role: 'admin', brand: 'TTT' };
    stored['admin-0'] = { cohortMode: 'all', show: {}, updatedAt: 5 };
    const saved = await ctx.pflxMhpmSave({ cohortMode: 'custom', cohorts: ['Class B', 'N/A'], show: { tasks: false } });
    ok(saved === true && writes.join() === 'pflx_master_player_mode', 'save writes only pflx_master_player_mode');
    ok(stored['admin-0'] && stored['admin-0'].updatedAt === 5, 'other hosts\' entries preserved (read-merge-write)');
    ok(JSON.stringify(ctx.pflxMhpmCohorts()) === '["Class B"]', 'custom cohorts applied');
    ok(ctx.pflxMhpmShows('tasks') === false && ctx.pflxMhpmShows('projects') === true, 'show toggles applied');
    ok(/HIDDEN IN YOUR PLAYER MODE/.test(ctx.pflxMhpmHiddenHtml('tasks')), 'hidden page message');
    stored['admin-1'].updatedAt = Date.now() + 60000;
    const stale = await ctx.pflxMhpmSave({ cohortMode: 'all' });
    ok(stale === false && stored['admin-1'].cohortMode === 'custom', 'an older save never overwrites a newer stored entry');
    ctx.activeSession = { id: 'p1', role: 'player' };
    const denied = await ctx.pflxMhpmSave({ cohortMode: 'all' });
    ok(denied === false && writes.length === 1, 'non-master cannot save');
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
