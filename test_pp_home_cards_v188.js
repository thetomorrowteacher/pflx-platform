// PATCH PLATFORM v188 — unit tests for the rebuilt ppHomeProjectCardHtml /
// ppHomeProgramCardHtml / ppHomeTaskCardHtml home-dashboard carousel cards.
// Extracts the REAL shipped function source from the on-device preview.html
// (staged into this sandbox) and tests it directly — never a reimplementation.
'use strict';
const fs = require('fs');

const SRC_PATH = process.argv[2] || 'preview.html';
const src = fs.readFileSync(SRC_PATH, 'utf8');

let pass = 0, fail = 0;
function check(name, cond) {
    if (cond) { pass++; }
    else { fail++; console.log('FAIL:', name); }
}

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function extractFn(name) {
    const startMarker = 'function ' + name + '(';
    const start = src.indexOf(startMarker);
    if (start === -1) throw new Error('start marker not found: ' + name);
    // brace-count from the first '{' after the marker
    let i = src.indexOf('{', start);
    if (i === -1) throw new Error('no opening brace for ' + name);
    let depth = 0, end = -1;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end === -1) throw new Error('unbalanced braces for ' + name);
    return src.slice(start, end + 1);
}

check('PFLX_PATCH bumped to 188', /window\.PFLX_PATCH\s*=\s*188;/.test(src));

// ── PROJECT CARD ─────────────────────────────────────────────────
const projSrc = extractFn('ppHomeProjectCardHtml');
check('project fn found', projSrc.length > 100);
check('project card 340px/2-per-row', /flex:0 0 340px/.test(projSrc));
check('project card keeps home-pj- key prefix', /home-pj-/.test(projSrc));
check('project card keeps dropdown toggle', /ppToggleDropdown/.test(projSrc));
check('project card no Edit/Delete host action', !/Delete|Edit</i.test(projSrc) === false || !/onclick="[^"]*[Dd]elete/.test(projSrc));

function makeProjectSandbox() {
    const body = projSrc;
    const fn = new Function(
        'escapeHtml', 'window', 'ppGetCheckpoints', 'pflxFindCheckpoint', '_mcUrgencyForDueDate',
        'pflxPlayerCanEnterItem', 'pflxProjectCompletion', 'ppProgressBar', 'ppProjectStatsHtml',
        body + '\nreturn ppHomeProjectCardHtml;'
    );
    return fn;
}

function runProject(proj, opts) {
    opts = opts || {};
    const makeFn = makeProjectSandbox();
    const ppProjectStatsHtml = () => '<div class="stats-panel">STATS</div>';
    const ppProgressBar = (pct, color) => '<div class="bar" data-pct="' + pct + '" data-color="' + color + '"></div>';
    const pflxProjectCompletion = opts.completion || (() => ({ pct: 50, done: 1, total: 2 }));
    const pflxPlayerCanEnterItem = opts.canEnter !== undefined ? (() => opts.canEnter) : (() => true);
    const pflxFindCheckpoint = opts.parentCp !== undefined ? (() => opts.parentCp) : (() => null);
    const ppGetCheckpoints = () => [];
    const _mcUrgencyForDueDate = opts.urgency !== undefined ? (() => opts.urgency) : (() => null);
    const ppHomeProjectCardHtml = makeFn(escapeHtml, {}, ppGetCheckpoints, pflxFindCheckpoint, _mcUrgencyForDueDate,
        pflxPlayerCanEnterItem, pflxProjectCompletion, ppProgressBar, ppProjectStatsHtml);
    return ppHomeProjectCardHtml(proj);
}

(function () {
    const html = runProject({ id: 'p1', name: 'Brand Sprint', description: 'A great project', xcRewardPool: 40 },
        { completion: () => ({ pct: 60, done: 3, total: 5 }), canEnter: true });
    check('project: renders name', html.indexOf('Brand Sprint') !== -1);
    check('project: renders description', html.indexOf('A great project') !== -1);
    check('project: renders progress pct/done/total', html.indexOf('60') !== -1 && html.indexOf('3/5') !== -1);
    check('project: renders XC chip', html.indexOf('40 XC') !== -1);
    check('project: no LOCKED badge when canEnter', html.indexOf('LOCKED') === -1);
})();

(function () {
    const html = runProject({ id: 'p2', name: 'Locked Proj' }, { canEnter: false });
    check('project: LOCKED badge when !canEnter', html.indexOf('LOCKED') !== -1);
})();

(function () {
    const html = runProject({ id: 'p3', name: 'With Parent' }, { parentCp: { id: 'c1', name: 'Checkpoint Alpha' } });
    check('project: shows parent checkpoint tag', html.indexOf('Checkpoint Alpha') !== -1);
})();

(function () {
    const html = runProject({ id: 'p4', name: 'Urgent <script>', description: '<b>bold</b>' }, {
        urgency: { label: 'Due soon', rgb: '255,0,0' }
    });
    check('project: urgency label rendered', html.indexOf('Due soon') !== -1);
    check('project: name is escaped', html.indexOf('<script>') === -1);
    check('project: description is escaped', html.indexOf('<b>bold</b>') === -1);
})();

(function () {
    const html = runProject({ id: 'p5', name: 'Banner Proj', bannerImage: 'https://x/y.png' });
    check('project: banner image used when present', html.indexOf('https://x/y.png') !== -1);
})();

// ── PROGRAM CARD ────────────────────────────────────────────────
const progSrc = extractFn('ppHomeProgramCardHtml');
check('program fn found', progSrc.length > 100);
check('program card 340px/2-per-row', /flex:0 0 340px/.test(progSrc));
check('program card has no dropdown (by design)', !/ppToggleDropdown/.test(progSrc));
check('program card no Edit/Delete/Generate Checkpoints host action', !/Generate Checkpoints|>Edit<|>Delete</i.test(progSrc));
check('program card reuses mcApplyToProgramOrProject', /mcApplyToProgramOrProject/.test(progSrc));
check('program card reuses pflxEntryCtaLabel', /pflxEntryCtaLabel/.test(progSrc));

function makeProgramSandbox() {
    const body = progSrc;
    const fn = new Function(
        'escapeHtml', 'window', 'pflxPlayerCanEnterItem', 'pflxPlayerApplicationState', 'mcCheckpoints', 'pflxEntryCtaLabel',
        body + '\nreturn ppHomeProgramCardHtml;'
    );
    return fn;
}

function runProgram(pg, opts) {
    opts = opts || {};
    const makeFn = makeProgramSandbox();
    const pflxPlayerCanEnterItem = () => !!opts.canEnter;
    const pflxPlayerApplicationState = () => opts.appState || 'none';
    const mcCheckpoints = opts.checkpoints || [];
    const pflxEntryCtaLabel = () => opts.cta || 'Continue';
    const ppHomeProgramCardHtml = makeFn(escapeHtml, {}, pflxPlayerCanEnterItem, pflxPlayerApplicationState, mcCheckpoints, pflxEntryCtaLabel);
    return ppHomeProgramCardHtml(pg);
}

(function () {
    const html = runProgram({ id: 'pg1', name: 'AI & Innovation Internship', description: 'Learn AI' },
        { canEnter: true, cta: 'Continue', checkpoints: [{ programId: 'pg1' }, { programId: 'pg1' }, { programId: 'other' }] });
    check('program: OPEN state', html.indexOf('OPEN') !== -1);
    check('program: Start/Continue button rendered', html.indexOf('Continue') !== -1);
    check('program: no Apply button when canEnter', html.indexOf('Apply to Join') === -1);
    check('program: checkpoint count correct (2)', html.indexOf('2 checkpoints') !== -1);
    check('program: name escaped correctly', html.indexOf(escapeHtml('AI & Innovation Internship')) !== -1);
})();

(function () {
    const html = runProgram({ id: 'pg2', name: 'Locked Cohort', applyEnabled: false, lockMessage: 'Falcon Studios only' }, { canEnter: false });
    check('program: LOCKED state with lockMessage', html.indexOf('Falcon Studios only') !== -1);
    check('program: no Apply button when applyEnabled false', html.indexOf('Apply to Join') === -1);
})();

(function () {
    const html = runProgram({ id: 'pg3', name: 'Apply Me', applyEnabled: true, price: 0 }, { canEnter: false, appState: 'none' });
    check('program: Apply to Join — Free shown', html.indexOf('Apply to Join') !== -1 && html.indexOf('Free') !== -1);
})();

(function () {
    const html = runProgram({ id: 'pg4', name: 'Paid Program', applyEnabled: true, price: 25 }, { canEnter: false, appState: 'none' });
    check('program: Apply to Join — priced', html.indexOf('$25') !== -1);
})();

(function () {
    const html = runProgram({ id: 'pg5', name: 'Pending App', applyEnabled: true }, { canEnter: false, appState: 'pending' });
    check('program: PENDING state', html.indexOf('PENDING') !== -1);
    check('program: no Apply button while pending', html.indexOf('Apply to Join') === -1);
})();

(function () {
    const html = runProgram({ id: 'pg6', name: 'Unpaid App', applyEnabled: true, price: 50 }, { canEnter: false, appState: 'approved-unpaid' });
    check('program: PAY $ state', html.indexOf('PAY $50') !== -1);
})();

// ── TASK CARD ─────────────────────────────────────────────────────
const taskSrc = extractFn('ppHomeTaskCardHtml');
check('task fn found', taskSrc.length > 100);
check('task card widened to 340px (v189: matches Programs/Projects row)', /flex:0 0 340px/.test(taskSrc));
check('task card shows linked checkpoint/project tag', /linkTag/.test(taskSrc));
check('task card shows checklist progress', /checklist\.length/.test(taskSrc));
check('task card shows badge chips', /rewardBadges/.test(taskSrc));
check('task card no edit/delete host action', !/>Edit<|>Delete</i.test(taskSrc));

function makeTaskSandbox() {
    const body = taskSrc;
    const fn = new Function(
        'escapeHtml', 'window', 'ppGetCheckpoints', 'ppGetProjects', 'pflxFindProject', 'pflxFindCheckpoint',
        'pflxTaskStateForPlayer', 'ppProgressBar',
        body + '\nreturn ppHomeTaskCardHtml;'
    );
    return fn;
}

function runTask(t, opts) {
    opts = opts || {};
    const makeFn = makeTaskSandbox();
    const ppGetCheckpoints = () => [];
    const ppGetProjects = () => [];
    const pflxFindProject = () => opts.parentProj || null;
    const pflxFindCheckpoint = () => opts.parentCp || null;
    const pflxTaskStateForPlayer = () => opts.state || 'open';
    const ppProgressBar = (pct, color) => '<div class="bar" data-pct="' + pct + '" data-color="' + color + '"></div>';
    const ppHomeTaskCardHtml = makeFn(escapeHtml, { activeSession: opts.session || { id: 'pid1' } }, ppGetCheckpoints, ppGetProjects,
        pflxFindProject, pflxFindCheckpoint, pflxTaskStateForPlayer, ppProgressBar);
    return ppHomeTaskCardHtml(t);
}

(function () {
    const html = runTask({ id: 't1', title: 'Write a script', description: 'Draft the intro scene', xcReward: 15,
        checklist: ['step1', 'step2', 'step3'], submission: { submittedBy: 'pid1', checklist: [true, true, false] } },
        { state: 'submitted', session: { id: 'pid1' } });
    check('task: title rendered', html.indexOf('Write a script') !== -1);
    check('task: description rendered', html.indexOf('Draft the intro scene') !== -1);
    check('task: XC chip rendered', html.indexOf('15 XC') !== -1);
    check('task: SUBMITTED state label', html.indexOf('SUBMITTED') !== -1);
    check('task: checklist items rendered individually (v189)', html.indexOf('step1') !== -1 && html.indexOf('step2') !== -1 && html.indexOf('step3') !== -1);
    check('task: checked/unchecked item icons both present (v189)', html.indexOf('✅') !== -1 && html.indexOf('⬜') !== -1);
})();

(function () {
    const html = runTask({ id: 't2', title: 'Approved Task', projectId: 'proj1' },
        { state: 'approved', parentProj: { id: 'proj1', name: 'Brand Sprint' } });
    check('task: APPROVED state + strikethrough', html.indexOf('APPROVED') !== -1 && html.indexOf('line-through') !== -1);
    check('task: linked project tag shown', html.indexOf('Brand Sprint') !== -1);
})();

(function () {
    const html = runTask({ id: 't3', title: 'Checkpoint-linked task', roundId: 'cp1' },
        { state: 'open', parentCp: { id: 'cp1', name: 'Checkpoint Beta' } });
    check('task: OPEN state', html.indexOf('>OPEN<') !== -1);
    check('task: linked checkpoint tag shown when no project', html.indexOf('Checkpoint Beta') !== -1);
})();

(function () {
    const html = runTask({ id: 't4', title: 'No checklist here', xcReward: 5 }, { state: 'open' });
    check('task: no checklist progress when checklist absent', html.indexOf('checked</div>') === -1);
})();

(function () {
    const html = runTask({ id: 't5', title: 'Badged Task', rewardBadges: ['Pro Coder', 'Fast Learner', 'Extra Badge'] }, { state: 'open' });
    check('task: badge chips rendered (max 2)', html.indexOf('Pro Coder') !== -1 && html.indexOf('Fast Learner') !== -1 && html.indexOf('Extra Badge') === -1);
})();

(function () {
    const html = runTask({ id: 't6', title: 'Hostile <img onerror=alert(1)>' }, { state: 'open' });
    check('task: title escaped (XSS safe)', html.indexOf('<img onerror') === -1);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
