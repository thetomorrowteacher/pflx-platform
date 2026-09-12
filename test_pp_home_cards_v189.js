// PATCH PLATFORM v189 -- unit tests for the corrected ppHomeProjectCardHtml
// (poster style: description/progress/XC/urgency/parent-checkpoint tag moved
// behind the dropdown) and ppHomeTaskCardHtml (widened to 340px, real
// per-item checklist rows, new Resources section from task.links).
// Extracts the REAL shipped function source from the on-device preview.html
// (staged into this sandbox) and tests it directly -- never a reimplementation.
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

check('PFLX_PATCH bumped to 189', /window\.PFLX_PATCH\s*=\s*189;/.test(src));

// ── PROJECT CARD (poster-style correction) ──────────────────────────────
const projSrc = extractFn('ppHomeProjectCardHtml');
check('project fn found', projSrc.length > 100);
check('project card still 340px', /flex:0 0 340px/.test(projSrc));
check('project card banner height increased to 170px (poster look)', /height:170px/.test(projSrc));
check('project card keeps home-pj- key prefix', /home-pj-/.test(projSrc));
check('project card keeps dropdown toggle', /ppToggleDropdown/.test(projSrc));
check('project card still calls ppProjectStatsHtml inside dropdown', /ppProjectStatsHtml\(proj\)/.test(projSrc));

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
    const ppProjectStatsHtml = () => '<div class="stats-panel">STATS-MARKER</div>';
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
        { completion: () => ({ pct: 60, done: 3, total: 5 }), canEnter: true, parentCp: { id: 'c1', name: 'Checkpoint Alpha' } });
    const dropIdx = html.indexOf('id="pp-drop-');
    check('project: dropdown marker present', dropIdx !== -1);
    check('project: name appears before the dropdown (always visible)', html.indexOf('Brand Sprint') < dropIdx);
    check('project: description now lives INSIDE the dropdown (poster style)', html.indexOf('A great project') > dropIdx);
    check('project: XC chip now lives INSIDE the dropdown', html.indexOf('40 XC') > dropIdx);
    check('project: parent checkpoint tag now lives INSIDE the dropdown', html.indexOf('Checkpoint Alpha') > dropIdx);
    check('project: stats panel still reachable via dropdown', html.indexOf('STATS-MARKER') !== -1);
})();

(function () {
    const html = runProject({ id: 'p2', name: 'Locked Proj' }, { canEnter: false });
    check('project: LOCKED badge still shown (poster overlay) when !canEnter', html.indexOf('LOCKED') !== -1);
})();

(function () {
    const html = runProject({ id: 'p3', name: 'Urgent <script>', description: '<b>bold</b>' }, {
        urgency: { label: 'Due soon', rgb: '255,0,0' }
    });
    check('project: name is escaped', html.indexOf('<script>') === -1);
    check('project: description is escaped', html.indexOf('<b>bold</b>') === -1);
})();

// ── TASK CARD (widened, real checklist items, Resources) ────────────────
const taskSrc = extractFn('ppHomeTaskCardHtml');
check('task fn found', taskSrc.length > 100);
check('task card widened to 340px (matches Programs/Projects row)', /flex:0 0 340px/.test(taskSrc));
check('task card renders per-item checklist rows (not just a progress bar)', /checklist\.slice\(0, CL_CAP\)/.test(taskSrc));
check('task card caps checklist display at 4 with a "+N more" note', /CL_CAP = 4/.test(taskSrc) && /more<\/div>/.test(taskSrc));
check('task card reads the REAL task.links field for Resources', /Array\.isArray\(t\.links\)/.test(taskSrc));
check('task card caps Resources display at 2 with a "+N more" note', /LINK_CAP = 2/.test(taskSrc));
check('task card Resources links open in a new tab, safely', /target="_blank"/.test(taskSrc) && /rel="noopener"/.test(taskSrc));
check('task card Resources links stop click propagation (no accidental nav)', /RESOURCES[\s\S]*?event\.stopPropagation\(\)/.test(taskSrc));
check('task card has no "Attach" action (host authoring, out of player scope)', !/Attach/.test(taskSrc));
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
    const html = runTask({
        id: 't1', title: 'Write a script', xcReward: 15,
        checklist: ['Add your name to the first slide', 'Change the project name', 'Draft the intro scene', 'Record voiceover', 'Export final cut'],
        submission: { submittedBy: 'pid1', checklist: [true, true, false, false, false] }
    }, { state: 'submitted', session: { id: 'pid1' } });
    check('task: first 4 checklist items rendered', html.indexOf('Add your name to the first slide') !== -1 && html.indexOf('Draft the intro scene') !== -1 && html.indexOf('Record voiceover') !== -1);
    check('task: 5th checklist item NOT rendered (capped)', html.indexOf('Export final cut') === -1);
    check('task: "+1 more" shown for the capped checklist item', html.indexOf('+1 more') !== -1);
    check('task: checked item uses the checked icon', html.indexOf('✅') !== -1);
    check('task: unchecked item uses the unchecked icon', html.indexOf('⬜') !== -1);
})();

(function () {
    const html = runTask({ id: 't2', title: 'Resourced task',
        links: [
            { url: 'https://drive.google.com/a', label: 'Portfolio Template' },
            { url: 'https://drive.google.com/b', label: 'Rubric' },
            { url: 'https://drive.google.com/c', label: 'Extra Resource' }
        ]
    }, { state: 'open' });
    check('task: RESOURCES heading shown', html.indexOf('RESOURCES') !== -1);
    check('task: first resource link rendered', html.indexOf('Portfolio Template') !== -1 && html.indexOf('https://drive.google.com/a') !== -1);
    check('task: second resource link rendered', html.indexOf('Rubric') !== -1);
    check('task: third resource link NOT rendered (capped at 2)', html.indexOf('Extra Resource') === -1);
    check('task: "+1 more" shown for the capped resources', html.indexOf('+1 more') !== -1);
})();

(function () {
    const html = runTask({ id: 't3', title: 'Plain string links', links: ['https://example.com/x'] }, { state: 'open' });
    check('task: plain-string link entries are supported (not just {url,label} objects)', html.indexOf('https://example.com/x') !== -1);
})();

(function () {
    const html = runTask({ id: 't4', title: 'Nothing extra here' }, { state: 'open' });
    check('task: no RESOURCES section when task.links absent', html.indexOf('RESOURCES') === -1);
    check('task: no checklist rows when task.checklist absent (state icon aside)', html.indexOf('padding:2px 0;font-size:10px') === -1);
})();

(function () {
    const html = runTask({ id: 't5', title: 'Hostile task',
        checklist: ['<img src=x onerror=alert(1)>'],
        links: [{ url: 'javascript:alert(1)', label: '<script>bad</script>' }]
    }, { state: 'open' });
    check('task: checklist item label is escaped (XSS safe)', html.indexOf('<img src=x') === -1);
    check('task: resource label is escaped (XSS safe)', html.indexOf('<script>bad</script>') === -1);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
