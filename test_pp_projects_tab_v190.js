// PATCH PLATFORM v190 — unit tests for the redesigned player Projects tab
// (ppRenderProjects): card-size slider + FLP status-bucket banners, ported
// from the host's mcRenderProjects pattern. Extracts the REAL shipped
// function source from the on-device preview.html and tests it directly —
// never a reimplementation.
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

// Extracts a top-level "var NAME = <expr>;" statement (object/array literal),
// scanning to the first semicolon at brace-depth 0 so nested {..}/[..] in the
// literal don't terminate the match early.
function extractVar(name) {
    const startMarker = 'var ' + name + ' = ';
    const start = src.indexOf(startMarker);
    if (start === -1) throw new Error('var start marker not found: ' + name);
    let depth = 0, end = -1;
    for (let j = start; j < src.length; j++) {
        const c = src[j];
        if (c === '{' || c === '[') depth++;
        else if (c === '}' || c === ']') depth--;
        else if (c === ';' && depth === 0) { end = j; break; }
    }
    if (end === -1) throw new Error('unterminated var statement for ' + name);
    return src.slice(start, end + 1);
}

check('PFLX_PATCH bumped to 190', /window\.PFLX_PATCH\s*=\s*190;/.test(src));

// ── shared card-size map extension ──
check('card-size DEFAULTS extended with ppprojects/ppcheckpoints/pptasks/ppprograms',
    /ppprojects:\s*380,\s*ppcheckpoints:\s*380,\s*pptasks:\s*340,\s*ppprograms:\s*380/.test(src));
check('card-size RANGE extended', /ppprojects:\s*\[260,\s*900\]/.test(src));
check('card-size LIST_ID extended', /ppprojects:\s*'ppmc-projects-list'/.test(src));

// ── helper functions present and reused, not duplicated logic per tab ──
const bucketMetaSrc = extractVar('PP_FLP_BUCKET_META');
const bucketOrderSrc = extractVar('PP_FLP_BUCKET_ORDER');
const bucketFnSrc = extractFn('ppFlpBucketFor');
const sectionsFnSrc = extractFn('ppBucketedSectionsHtml');
check('PP_FLP_BUCKET_META found', bucketMetaSrc.length > 50);
check('PP_FLP_BUCKET_ORDER found', bucketOrderSrc.length > 20);
check('ppFlpBucketFor found', bucketFnSrc.length > 50);
check('ppBucketedSectionsHtml found', sectionsFnSrc.length > 100);
check('ppFlpBucketFor exported on window (testable elsewhere)', /window\.ppFlpBucketFor\s*=\s*ppFlpBucketFor;/.test(src));
check('ppBucketedSectionsHtml exported on window', /window\.ppBucketedSectionsHtml\s*=\s*ppBucketedSectionsHtml;/.test(src));

const projSrc = extractFn('ppRenderProjects');
check('ppRenderProjects found', projSrc.length > 100);
check('ppRenderProjects wires the card-size slider (ppprojects key)', /pflxCardSizeSliderHtml\('ppprojects', 'Project'\)/.test(projSrc));
check('ppRenderProjects applies the persisted card size on render', /pflxApplyCardSize\('ppprojects'\)/.test(projSrc));
check('ppRenderProjects wraps cards in an id="ppmc-projects-list" grid container', /id="ppmc-projects-list"/.test(projSrc));
check('ppRenderProjects still keeps its per-card dropdown toggle', /ppToggleDropdown/.test(projSrc));
check('ppRenderProjects still calls ppProjectStatsHtml (unchanged progress delegation)', /ppProjectStatsHtml\(proj\)/.test(projSrc));
check('ppRenderProjects delegates bucketing to the shared helper', /ppBucketedSectionsHtml\(/.test(projSrc));

// ── sandbox the real function and exercise real bucketing behavior ──
function makeProjectsSandbox() {
    const body = bucketMetaSrc + '\n' + bucketOrderSrc + '\n' + bucketFnSrc + '\n' + sectionsFnSrc + '\n' + projSrc;
    const fn = new Function(
        'escapeHtml', 'window', 'ppGetProjects', 'ppGetCheckpoints', 'ppItemAssignedToActivePlayer',
        'ppBreadcrumb', 'pflxApplyCardSize', 'pflxCardSizeSliderHtml', 'pflxPlayerCanEnterItem',
        'pflxFindCheckpoint', '_mcUrgencyForDueDate', 'ppProgressBar', 'ppProjectStatsHtml',
        'ppToggleDropdown', 'pflxComputeFlpStatus',
        body + '\nreturn ppRenderProjects;'
    );
    return fn;
}

function runProjects(projects, opts) {
    opts = opts || {};
    const makeFn = makeProjectsSandbox();
    const calls = { applyCardSize: [], sliderHtml: [] };
    const pflxApplyCardSize = function (k) { calls.applyCardSize.push(k); };
    const pflxCardSizeSliderHtml = function (k, label) { calls.sliderHtml.push([k, label]); return '<div class="slider-mock">' + k + '</div>'; };
    const ppGetProjects = function () { return projects; };
    const ppGetCheckpoints = function () { return []; };
    const ppItemAssignedToActivePlayer = function () { return true; };
    const ppBreadcrumb = function () { return '<div class="crumb"></div>'; };
    const pflxPlayerCanEnterItem = function () { return true; };
    const pflxFindCheckpoint = function () { return null; };
    const _mcUrgencyForDueDate = function () { return null; };
    const ppProgressBar = function (pct, color) { return '<div class="bar" data-pct="' + pct + '" data-color="' + color + '"></div>'; };
    const ppProjectStatsHtml = function () { return '<div class="stats-panel">STATS</div>'; };
    const ppToggleDropdown = function () {};
    const pflxComputeFlpStatus = opts.computeFlpStatus || function () { return null; };
    const ppRenderProjectsFn = makeFn(
        escapeHtml, {}, ppGetProjects, ppGetCheckpoints, ppItemAssignedToActivePlayer,
        ppBreadcrumb, pflxApplyCardSize, pflxCardSizeSliderHtml, pflxPlayerCanEnterItem,
        pflxFindCheckpoint, _mcUrgencyForDueDate, ppProgressBar, ppProjectStatsHtml,
        ppToggleDropdown, pflxComputeFlpStatus
    );
    const el = { innerHTML: '' };
    ppRenderProjectsFn(el);
    return { html: el.innerHTML, calls: calls };
}

(function () {
    const r = runProjects([]);
    check('empty projects: no projects available message shown', r.html.indexOf('NO PROJECTS AVAILABLE') !== -1);
})();

(function () {
    // status === 'completed' -> completed bucket
    const r = runProjects([{ id: 'p1', name: 'Done Proj', status: 'completed' }]);
    check('single completed project: shows Completed bucket banner', r.html.indexOf('Completed') !== -1);
    check('single completed project: shows "1 project" (singular)', r.html.indexOf('1 project<') !== -1 || /1 project(?![s])/.test(r.html));
    check('applies card size on render with ppprojects key', r.calls.applyCardSize.indexOf('ppprojects') !== -1);
    check('renders the card-size slider with ppprojects key', r.calls.sliderHtml.some(function (c) { return c[0] === 'ppprojects'; }));
    check('wraps output in the ppmc-projects-list grid container', r.html.indexOf('id="ppmc-projects-list"') !== -1);
})();

(function () {
    // no flpTracking === 'monitoring' -> bypass bucket
    const r = runProjects([{ id: 'p2', name: 'Simple Proj' }]);
    check('project with no FLP tracking lands in Bypass bucket', r.html.indexOf('Bypass') !== -1);
    check('bypass bucket description text present', r.html.indexOf('Simple projects without phase tracking') !== -1);
})();

(function () {
    // monitoring + no startedAt -> not-started bucket
    const r = runProjects([{ id: 'p3', name: 'Waiting Proj', flpTracking: 'monitoring' }]);
    check('monitored project with no startedAt lands in Not Started bucket', r.html.indexOf('Not Started') !== -1);
})();

(function () {
    // monitoring + startedAt + pflxComputeFlpStatus returns a phase
    const r = runProjects(
        [{ id: 'p4', name: 'Building Proj', flpTracking: 'monitoring', startedAt: Date.now() }],
        { computeFlpStatus: function () { return { phase: 'development' }; } }
    );
    check('monitored + in-progress project lands in the phase FLP status returns', r.html.indexOf('Development') !== -1);
})();

(function () {
    // multiple projects across different buckets all render, each in its own section
    const r = runProjects([
        { id: 'p5', name: 'Done A', status: 'completed' },
        { id: 'p6', name: 'Simple B' },
        { id: 'p7', name: 'Waiting C', flpTracking: 'monitoring' }
    ]);
    check('multi-bucket render: all three project names present', r.html.indexOf('Done A') !== -1 && r.html.indexOf('Simple B') !== -1 && r.html.indexOf('Waiting C') !== -1);
    check('multi-bucket render: three distinct bucket banners (Completed/Bypass/Not Started)',
        r.html.indexOf('Completed') !== -1 && r.html.indexOf('Bypass') !== -1 && r.html.indexOf('Not Started') !== -1);
    // 'Done A' should appear before 'Simple B' before 'Waiting C' since bucket
    // order is engagement/development/enhancement/fulfillment/not-started/bypass/completed
    // -> not-started, then bypass, then completed
    const idxWaiting = r.html.indexOf('Waiting C');
    const idxSimple = r.html.indexOf('Simple B');
    const idxDone = r.html.indexOf('Done A');
    check('bucket order respected: not-started before bypass before completed', idxWaiting < idxSimple && idxSimple < idxDone);
})();

(function () {
    // an empty bucket must not render a banner at all
    const r = runProjects([{ id: 'p8', name: 'Only One', status: 'completed' }]);
    check('empty buckets render no banner (Engagement not present)', r.html.indexOf('Engagement') === -1);
    check('empty buckets render no banner (Fulfillment not present)', r.html.indexOf('Fulfillment') === -1);
})();

(function () {
    // XSS safety unaffected by the bucketing refactor
    const r = runProjects([{ id: 'p9', name: '<script>alert(1)</script>', status: 'completed' }]);
    check('project name still escaped inside the bucketed grid', r.html.indexOf('<script>alert(1)</script>') === -1);
})();

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
