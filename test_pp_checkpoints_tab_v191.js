// PATCH PLATFORM v191 — unit tests for the redesigned player Checkpoints tab
// (ppRenderCheckpoints): card-size slider + status-bucket banners (a 4-state
// lifecycle model — upcoming/active/open/completed — distinct from the FLP
// phase model used by Projects/Tasks, since Checkpoints has no
// _mcFlpBucketForCheckpoint anywhere in the host code). Extracts the REAL
// shipped function source from the on-device preview.html and tests it
// directly — never a reimplementation.
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

check('PFLX_PATCH bumped to 191', /window\.PFLX_PATCH\s*=\s*191;/.test(src));

// ── helper block presence ──
const bucketMetaSrc = extractVar('PP_CP_STATUS_BUCKET_META');
const bucketOrderSrc = extractVar('PP_CP_STATUS_BUCKET_ORDER');
const bucketFnSrc = extractFn('ppCheckpointStatusBucketFor');
check('PP_CP_STATUS_BUCKET_META found', bucketMetaSrc.length > 50);
check('PP_CP_STATUS_BUCKET_ORDER found', bucketOrderSrc.length > 20);
check('ppCheckpointStatusBucketFor found', bucketFnSrc.length > 50);
check('ppCheckpointStatusBucketFor exported on window (testable elsewhere)', /window\.ppCheckpointStatusBucketFor\s*=\s*ppCheckpointStatusBucketFor;/.test(src));
check('bucket order is active/open/upcoming/completed (completed last, matches house convention)', /\[\s*'active',\s*'open',\s*'upcoming',\s*'completed'\s*\]/.test(bucketOrderSrc));

// ppBucketedSectionsHtml is shared infra from v190 -- confirm it's still
// present and reused, not re-implemented for Checkpoints.
const sectionsFnSrc = extractFn('ppBucketedSectionsHtml');
check('ppBucketedSectionsHtml (shared v190 helper) found', sectionsFnSrc.length > 100);

const cpSrc = extractFn('ppRenderCheckpoints');
check('ppRenderCheckpoints found', cpSrc.length > 100);
check('ppRenderCheckpoints wires the card-size slider (ppcheckpoints key)', /pflxCardSizeSliderHtml\('ppcheckpoints', 'Checkpoint'\)/.test(cpSrc));
check('ppRenderCheckpoints applies the persisted card size on render', /pflxApplyCardSize\('ppcheckpoints'\)/.test(cpSrc));
check('ppRenderCheckpoints wraps cards in an id="ppmc-checkpoints-list" grid container', /id="ppmc-checkpoints-list"/.test(cpSrc));
check('ppRenderCheckpoints still keeps its per-card dropdown toggle', /ppToggleDropdown/.test(cpSrc));
check('ppRenderCheckpoints still calls ppCheckpointStatsHtml (unchanged stats delegation)', /ppCheckpointStatsHtml\(cp\)/.test(cpSrc));
check('ppRenderCheckpoints delegates bucketing to the shared helper', /ppBucketedSectionsHtml\(/.test(cpSrc));
check('ppRenderCheckpoints does NOT invent its own FLP bucket logic (no ppFlpBucketFor call)', !/ppFlpBucketFor\(/.test(cpSrc));

// ── standalone classifier tests (pure function, no sandbox needed) ──
function makeClassifierSandbox() {
    const fn = new Function(bucketMetaSrc + '\n' + bucketOrderSrc + '\n' + bucketFnSrc + '\nreturn ppCheckpointStatusBucketFor;');
    return fn();
}
(function () {
    const classify = makeClassifierSandbox();
    check('classifier: status "completed" -> completed bucket', classify({ status: 'completed' }) === 'completed');
    check('classifier: status "open" -> open bucket', classify({ status: 'open' }) === 'open');
    check('classifier: status "upcoming" -> upcoming bucket', classify({ status: 'upcoming' }) === 'upcoming');
    check('classifier: status "active" -> active bucket', classify({ status: 'active' }) === 'active');
    check('classifier: legacy status "current" -> active bucket (matches old isActive check)', classify({ status: 'current' }) === 'active');
    check('classifier: unrecognized/missing status defaults to active', classify({}) === 'active');
    check('classifier: never throws on a null-ish input', (function () { try { classify(null); return true; } catch (e) { return false; } })());
})();

// ── sandbox the real ppRenderCheckpoints and exercise real bucketing behavior ──
function makeCheckpointsSandbox() {
    const body = bucketMetaSrc + '\n' + bucketOrderSrc + '\n' + bucketFnSrc + '\n' + sectionsFnSrc + '\n' + cpSrc;
    const fn = new Function(
        'escapeHtml', 'window', 'ppGetCheckpoints', 'ppBreadcrumb', 'pflxApplyCardSize',
        'pflxCardSizeSliderHtml', 'ppCheckpointStatsHtml', 'ppToggleDropdown', 'ppProgressBar',
        'ppGetTasks', 'ppItemInCheckpoint', 'ppItemAssignedToActivePlayer', 'pflxTaskStateForPlayer',
        '_mcTaskHostComplete',
        body + '\nreturn ppRenderCheckpoints;'
    );
    return fn;
}

function runCheckpoints(checkpoints, opts) {
    opts = opts || {};
    const makeFn = makeCheckpointsSandbox();
    const calls = { applyCardSize: [], sliderHtml: [] };
    const pflxApplyCardSize = function (k) { calls.applyCardSize.push(k); };
    const pflxCardSizeSliderHtml = function (k, label) { calls.sliderHtml.push([k, label]); return '<div class="slider-mock">' + k + '</div>'; };
    const ppGetCheckpoints = function () { return checkpoints; };
    const ppBreadcrumb = function () { return '<div class="crumb"></div>'; };
    const ppCheckpointStatsHtml = function () { return '<div class="stats-panel">STATS</div>'; };
    const ppToggleDropdown = function () {};
    const ppProgressBar = function (pct, color) { return '<div class="bar" data-pct="' + pct + '" data-color="' + color + '"></div>'; };
    const ppGetTasks = function () { return []; };
    const ppItemInCheckpoint = function () { return false; };
    const ppItemAssignedToActivePlayer = function () { return true; };
    const pflxTaskStateForPlayer = function () { return null; };
    const _mcTaskHostComplete = function () { return false; };
    const ppRenderCheckpointsFn = makeFn(
        escapeHtml, {}, ppGetCheckpoints, ppBreadcrumb, pflxApplyCardSize,
        pflxCardSizeSliderHtml, ppCheckpointStatsHtml, ppToggleDropdown, ppProgressBar,
        ppGetTasks, ppItemInCheckpoint, ppItemAssignedToActivePlayer, pflxTaskStateForPlayer,
        _mcTaskHostComplete
    );
    const el = { innerHTML: '' };
    ppRenderCheckpointsFn(el);
    return { html: el.innerHTML, calls: calls };
}

(function () {
    const r = runCheckpoints([]);
    check('empty checkpoints: no checkpoints available message shown', r.html.indexOf('NO CHECKPOINTS AVAILABLE') !== -1);
})();

(function () {
    const r = runCheckpoints([{ id: 'c1', name: 'Active Sprint', status: 'active' }]);
    check('single active checkpoint: shows Active Now bucket banner', r.html.indexOf('Active Now') !== -1);
    check('applies card size on render with ppcheckpoints key', r.calls.applyCardSize.indexOf('ppcheckpoints') !== -1);
    check('renders the card-size slider with ppcheckpoints key', r.calls.sliderHtml.some(function (c) { return c[0] === 'ppcheckpoints'; }));
    check('wraps output in the ppmc-checkpoints-list grid container', r.html.indexOf('id="ppmc-checkpoints-list"') !== -1);
    check('checkpoint name present', r.html.indexOf('Active Sprint') !== -1);
})();

(function () {
    const r = runCheckpoints([{ id: 'c2', name: 'Open Enrollment CP', status: 'open' }]);
    check('open checkpoint lands in Open bucket', r.html.indexOf('Open') !== -1);
    check('open bucket description text present', r.html.indexOf('Open enrollment -- join anytime.') !== -1 || r.html.indexOf('Open enrollment') !== -1);
})();

(function () {
    const r = runCheckpoints([{ id: 'c3', name: 'Future CP', status: 'upcoming' }]);
    check('upcoming checkpoint lands in Upcoming bucket', r.html.indexOf('Upcoming') !== -1);
})();

(function () {
    const r = runCheckpoints([{ id: 'c4', name: 'Done CP', status: 'completed' }]);
    check('completed checkpoint lands in Completed bucket', r.html.indexOf('Completed') !== -1);
})();

(function () {
    // multiple checkpoints across different buckets, ordering matches
    // PP_CP_STATUS_BUCKET_ORDER: active, open, upcoming, completed
    const r = runCheckpoints([
        { id: 'c5', name: 'Done E', status: 'completed' },
        { id: 'c6', name: 'Future F', status: 'upcoming' },
        { id: 'c7', name: 'Live G', status: 'active' },
        { id: 'c8', name: 'Join H', status: 'open' }
    ]);
    check('multi-bucket render: all four checkpoint names present',
        r.html.indexOf('Done E') !== -1 && r.html.indexOf('Future F') !== -1 &&
        r.html.indexOf('Live G') !== -1 && r.html.indexOf('Join H') !== -1);
    const idxLive = r.html.indexOf('Live G');
    const idxJoin = r.html.indexOf('Join H');
    const idxFuture = r.html.indexOf('Future F');
    const idxDone = r.html.indexOf('Done E');
    check('bucket order respected: active before open before upcoming before completed',
        idxLive < idxJoin && idxJoin < idxFuture && idxFuture < idxDone);
})();

(function () {
    // an empty bucket must not render a banner at all
    const r = runCheckpoints([{ id: 'c9', name: 'Only One', status: 'active' }]);
    check('empty buckets render no banner (Open not present)', r.html.indexOf('Open') === -1);
    check('empty buckets render no banner (Upcoming not present)', r.html.indexOf('Upcoming') === -1);
    check('empty buckets render no banner (Completed not present)', r.html.indexOf('Completed') === -1);
})();

(function () {
    // XSS safety unaffected by the bucketing refactor
    const r = runCheckpoints([{ id: 'c10', name: '<script>alert(1)</script>', status: 'active' }]);
    check('checkpoint name still escaped inside the bucketed grid', r.html.indexOf('<script>alert(1)</script>') === -1);
})();

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
