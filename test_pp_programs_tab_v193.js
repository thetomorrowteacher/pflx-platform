// PATCH PLATFORM v193 -- Programs tab redesign unit test.
// Extracts the real shipped functions from preview.html via brace-counting
// (never a reimplementation) and runs them in a sandboxed harness, mirroring
// the pattern established in test_pp_projects_tab_v190.js /
// test_pp_checkpoints_tab_v191.js / test_pp_tasks_tab_v192.js.

const fs = require('fs');
const path = process.argv[2] || 'preview.html';
const src = fs.readFileSync(path, 'utf8');

let pass = 0, fail = 0;
function check(label, cond) {
    if (cond) { pass++; }
    else { fail++; console.log('FAIL: ' + label); }
}

function extractFn(name) {
    const marker = 'function ' + name + '(';
    const start = src.indexOf(marker);
    if (start === -1) throw new Error('function not found: ' + name);
    const braceStart = src.indexOf('{', start);
    let depth = 0, i = braceStart;
    for (; i < src.length; i++) {
        const c = src[i];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    return src.slice(start, i);
}

function extractVar(name) {
    const marker = 'var ' + name + ' = ';
    const start = src.indexOf(marker);
    if (start === -1) throw new Error('var not found: ' + name);
    let i = start + marker.length;
    const opener = src[i];
    if (opener !== '{' && opener !== '[') throw new Error('unexpected var opener for ' + name + ': ' + opener);
    const closer = opener === '{' ? '}' : ']';
    let depth = 0;
    for (; i < src.length; i++) {
        const c = src[i];
        if (c === opener) depth++;
        else if (c === closer) { depth--; if (depth === 0) { i++; break; } }
    }
    if (src[i] === ';') i++;
    return src.slice(start, i);
}

// ---- Static checks ----
check('PFLX_PATCH bumped to 193', /window\.PFLX_PATCH\s*=\s*193;/.test(src));
check('ppProgramStatusBucketFor defined', src.indexOf('function ppProgramStatusBucketFor(pg)') !== -1);
check('ppProgramStatusBucketFor exported on window', src.indexOf('window.ppProgramStatusBucketFor = ppProgramStatusBucketFor;') !== -1);
check('PP_PROGRAM_STATUS_BUCKET_META defined', src.indexOf('var PP_PROGRAM_STATUS_BUCKET_META = {') !== -1);
check('PP_PROGRAM_STATUS_BUCKET_ORDER defined', src.indexOf("var PP_PROGRAM_STATUS_BUCKET_ORDER = ['open', 'apply', 'pending', 'payment', 'locked'];") !== -1);

const prSrc = extractFn('ppRenderPrograms');
check('ppRenderPrograms applies card size with ppprograms key', prSrc.indexOf("pflxApplyCardSize('ppprograms')") !== -1);
check('ppRenderPrograms renders the card-size slider with ppprograms/Program', prSrc.indexOf("pflxCardSizeSliderHtml('ppprograms', 'Program')") !== -1);
check('ppRenderPrograms reuses the shared ppBucketedSectionsHtml helper', prSrc.indexOf('ppBucketedSectionsHtml(') !== -1);
check('ppRenderPrograms classifies via ppProgramStatusBucketFor (not a new bucket system)', prSrc.indexOf('ppProgramStatusBucketFor') !== -1);
check('ppRenderPrograms reuses PP_PROGRAM_STATUS_BUCKET_META/ORDER', prSrc.indexOf('PP_PROGRAM_STATUS_BUCKET_META') !== -1 && prSrc.indexOf('PP_PROGRAM_STATUS_BUCKET_ORDER') !== -1);
check('ppRenderPrograms wraps output in the ppmc-programs-list grid container', prSrc.indexOf('id="ppmc-programs-list"') !== -1);
check('ppRenderPrograms reuses _pflxProgramRollup for the aggregate task-progress bar (not a per-player rewrite)', prSrc.indexOf('_pflxProgramRollup') !== -1);
check('ppRenderPrograms reuses ppProgressBar', prSrc.indexOf('ppProgressBar(') !== -1);
check('empty state message retained (NO PROGRAMS YET)', prSrc.indexOf('NO PROGRAMS YET') !== -1);
check('OPEN badge logic retained', prSrc.indexOf('OPEN') !== -1);
check('LOCKED badge logic retained', prSrc.indexOf('COHORT REQUIRED') !== -1);
check('PENDING badge logic retained', prSrc.indexOf('PENDING') !== -1);
check('PAY badge logic retained', prSrc.indexOf('PAY $') !== -1);
check('Apply to Join button logic retained', prSrc.indexOf('Apply to Join') !== -1);
check('checkpoint count line retained', prSrc.indexOf('checkpoint') !== -1);

// ---- Sandbox: classifier in isolation ----
function makeClassifierSandbox() {
    const body = extractFn('ppProgramStatusBucketFor');
    return new Function(
        'pflxPlayerCanEnterItem', 'pflxPlayerApplicationState',
        body + '\nreturn ppProgramStatusBucketFor;'
    );
}

(function () {
    function classify(canEnter, applyEnabled, appState) {
        const pflxPlayerCanEnterItem = function () { return canEnter; };
        const pflxPlayerApplicationState = function () { return appState; };
        const fn = makeClassifierSandbox()(pflxPlayerCanEnterItem, pflxPlayerApplicationState);
        return fn({ applyEnabled: applyEnabled });
    }

    check('classifier: canEnter=true -> open', classify(true, false, 'none') === 'open');
    check('classifier: canEnter=true even with applyEnabled/pending set -> still open (entry wins)', classify(true, true, 'pending') === 'open');
    check('classifier: canEnter=false, applyEnabled=false -> locked', classify(false, false, 'none') === 'locked');
    check('classifier: canEnter=false, applyEnabled=true, appState=pending -> pending', classify(false, true, 'pending') === 'pending');
    check('classifier: canEnter=false, applyEnabled=true, appState=approved-unpaid -> payment', classify(false, true, 'approved-unpaid') === 'payment');
    check('classifier: canEnter=false, applyEnabled=true, appState=none -> apply', classify(false, true, 'none') === 'apply');
    check('classifier: never throws on a bare {} program (no applyEnabled field)', (function () {
        try {
            const pflxPlayerCanEnterItem = function () { return false; };
            const pflxPlayerApplicationState = function () { return 'none'; };
            const fn = makeClassifierSandbox()(pflxPlayerCanEnterItem, pflxPlayerApplicationState);
            fn({});
            return true;
        } catch (e) { return false; }
    })());
    check('classifier: never throws on null pg (falls to locked via !pg guard)', (function () {
        try {
            const pflxPlayerCanEnterItem = function () { return false; };
            const pflxPlayerApplicationState = function () { return 'none'; };
            const fn = makeClassifierSandbox()(pflxPlayerCanEnterItem, pflxPlayerApplicationState);
            return fn(null) === 'locked';
        } catch (e) { return false; }
    })());
    check('classifier: missing pflxPlayerCanEnterItem/pflxPlayerApplicationState globals fail safe (canEnter defaults true)', (function () {
        const body = extractFn('ppProgramStatusBucketFor');
        const fn = new Function(body + '\nreturn ppProgramStatusBucketFor;')();
        return fn({ applyEnabled: true }) === 'open';
    })());
})();

// ---- Sandbox: full ppRenderPrograms render harness ----
function makeProgramsSandbox() {
    const PP_META_SRC = extractVar('PP_PROGRAM_STATUS_BUCKET_META');
    const PP_ORDER_SRC = extractVar('PP_PROGRAM_STATUS_BUCKET_ORDER');
    const bucketFnSrc = extractFn('ppProgramStatusBucketFor');
    const bucketedSectionsSrc = extractFn('ppBucketedSectionsHtml');
    const renderSrc = extractFn('ppRenderPrograms');

    const body = PP_META_SRC + '\n' + PP_ORDER_SRC + '\n' +
        bucketFnSrc + '\n' + bucketedSectionsSrc + '\n' + renderSrc +
        '\nreturn ppRenderPrograms;';

    return new Function(
        'escapeHtml', 'mcPrograms', 'mcCheckpoints', 'ppBreadcrumb',
        'pflxApplyCardSize', 'pflxCardSizeSliderHtml', 'pflxPlayerCanEnterItem',
        'pflxPlayerApplicationState', 'pflxEntryCtaLabel', '_pflxProgramRollup',
        'ppProgressBar', 'mcApplyToProgramOrProject', 'ppNav',
        body
    );
}

function runPrograms(programs, opts) {
    opts = opts || {};
    const calls = { applyCardSize: [], sliderHtml: [] };
    const escapeHtml = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
    const mcCheckpoints = opts.checkpoints || [];
    const ppBreadcrumb = function () { return '<div class="crumb"></div>'; };
    const pflxApplyCardSize = function (key) { calls.applyCardSize.push(key); };
    const pflxCardSizeSliderHtml = function (key, label) { calls.sliderHtml.push([key, label]); return '<div class="slider" data-key="' + key + '"></div>'; };
    const pflxPlayerCanEnterItem = opts.canEnterFn || function (pg) { return !!pg.__canEnter; };
    const pflxPlayerApplicationState = opts.appStateFn || function (pg) { return pg.__appState || 'none'; };
    const pflxEntryCtaLabel = function () { return 'Start'; };
    const _pflxProgramRollup = opts.rollupFn || function () { return { taskTotal: 0, taskDone: 0, taskPct: 0 }; };
    const ppProgressBar = function (pct, color) { return '<div class="bar" data-pct="' + pct + '" data-color="' + color + '"></div>'; };
    const mcApplyToProgramOrProject = function () {};
    const ppNav = function () {};

    const fn = makeProgramsSandbox()(
        escapeHtml, programs, mcCheckpoints, ppBreadcrumb,
        pflxApplyCardSize, pflxCardSizeSliderHtml, pflxPlayerCanEnterItem,
        pflxPlayerApplicationState, pflxEntryCtaLabel, _pflxProgramRollup,
        ppProgressBar, mcApplyToProgramOrProject, ppNav
    );
    const el = { innerHTML: '' };
    fn(el);
    return { html: el.innerHTML, calls: calls };
}

(function () {
    const r = runPrograms([]);
    check('empty programs: NO PROGRAMS YET message shown', r.html.indexOf('NO PROGRAMS YET') !== -1);
})();

(function () {
    const r = runPrograms([{ id: 'p1', name: 'BrandBuilder', __canEnter: true }]);
    check('applies card size on render with ppprograms key', r.calls.applyCardSize.indexOf('ppprograms') !== -1);
    check('renders the card-size slider with ppprograms/Program', r.calls.sliderHtml.some(function (c) { return c[0] === 'ppprograms' && c[1] === 'Program'; }));
    check('program name present', r.html.indexOf('BrandBuilder') !== -1);
    check('open program shows OPEN badge', r.html.indexOf('OPEN') !== -1);
    check('open program lands in the Open bucket banner', r.html.indexOf('Open') !== -1);
    check('wraps output in the ppmc-programs-list grid container', r.html.indexOf('id="ppmc-programs-list"') !== -1);
})();

(function () {
    const r = runPrograms([{ id: 'p2', name: 'Locked Program', __canEnter: false, applyEnabled: false, lockMessage: 'COHORT REQUIRED' }]);
    check('locked program shows LOCKED badge/message', r.html.indexOf('COHORT REQUIRED') !== -1);
    check('locked program lands in the Locked bucket banner', r.html.indexOf('Locked') !== -1);
})();

(function () {
    const r = runPrograms([{ id: 'p3', name: 'Pending Program', __canEnter: false, applyEnabled: true, __appState: 'pending' }]);
    check('pending program shows PENDING badge', r.html.indexOf('PENDING') !== -1);
    check('pending program lands in the Pending Approval bucket banner', r.html.indexOf('Pending Approval') !== -1);
})();

(function () {
    const r = runPrograms([{ id: 'p4', name: 'Payment Program', __canEnter: false, applyEnabled: true, __appState: 'approved-unpaid', price: 25 }]);
    check('payment-due program shows PAY $ badge with correct amount', r.html.indexOf('PAY $25') !== -1);
    check('payment-due program lands in the Payment Required bucket banner', r.html.indexOf('Payment Required') !== -1);
})();

(function () {
    const r = runPrograms([{ id: 'p5', name: 'Apply Program', __canEnter: false, applyEnabled: true, __appState: 'none', price: 0 }]);
    check('apply-open program shows an Apply to Join button', r.html.indexOf('Apply to Join') !== -1);
    check('apply-open program lands in the Application Open bucket banner', r.html.indexOf('Application Open') !== -1);
})();

(function () {
    const r = runPrograms([
        { id: 'p6', name: 'OpenOne', __canEnter: true },
        { id: 'p7', name: 'ApplyOne', __canEnter: false, applyEnabled: true, __appState: 'none' },
        { id: 'p8', name: 'PendingOne', __canEnter: false, applyEnabled: true, __appState: 'pending' },
        { id: 'p9', name: 'PaymentOne', __canEnter: false, applyEnabled: true, __appState: 'approved-unpaid', price: 10 },
        { id: 'p10', name: 'LockedOne', __canEnter: false, applyEnabled: false }
    ]);
    const idxOpen = r.html.indexOf('OpenOne');
    const idxApply = r.html.indexOf('ApplyOne');
    const idxPending = r.html.indexOf('PendingOne');
    const idxPayment = r.html.indexOf('PaymentOne');
    const idxLocked = r.html.indexOf('LockedOne');
    check('multi-bucket render: all five program names present',
        idxOpen !== -1 && idxApply !== -1 && idxPending !== -1 && idxPayment !== -1 && idxLocked !== -1);
    check('bucket order respected: open before apply before pending before payment before locked',
        idxOpen < idxApply && idxApply < idxPending && idxPending < idxPayment && idxPayment < idxLocked);
})();

(function () {
    const r = runPrograms([{ id: 'p11', name: 'OnlyOpen', __canEnter: true }]);
    check('empty buckets render no banner (Locked not present)', r.html.indexOf('Locked') === -1);
    check('empty buckets render no banner (Pending Approval not present)', r.html.indexOf('Pending Approval') === -1);
    check('empty buckets render no banner (Payment Required not present)', r.html.indexOf('Payment Required') === -1);
})();

(function () {
    const r = runPrograms(
        [{ id: 'p12', name: 'WithTasks', __canEnter: true }],
        { rollupFn: function () { return { taskTotal: 10, taskDone: 7, taskPct: 70 }; } }
    );
    check('task-progress bar rendered when _pflxProgramRollup reports tasks', r.html.indexOf('Tasks') !== -1);
    check('task-progress bar shows the done/total/pct figures', r.html.indexOf('7 / 10 (70%)') !== -1);
    check('task-progress bar uses the real ppProgressBar helper output', r.html.indexOf('class="bar" data-pct="70"') !== -1);
})();

(function () {
    const r = runPrograms(
        [{ id: 'p13', name: 'NoTasksYet', __canEnter: true }],
        { rollupFn: function () { return { taskTotal: 0, taskDone: 0, taskPct: 0 }; } }
    );
    check('no task-progress bar shown when the program has zero tasks (taskTotal=0)', r.html.indexOf('data-pct="0"') === -1);
})();

(function () {
    const r = runPrograms([{ id: 'p14', name: '<script>alert(1)</script>', __canEnter: true }]);
    check('program name still escaped inside the bucketed grid', r.html.indexOf('<script>alert(1)</script>') === -1);
})();

(function () {
    const r = runPrograms([{ id: 'p15', name: 'WithCheckpoints', __canEnter: true }], { checkpoints: [
        { id: 'c1', programId: 'p15' }, { id: 'c2', programId: 'p15' }, { id: 'c3', programId: 'other' }
    ] });
    check('checkpoint count scoped to this program only (2, not 3)', r.html.indexOf('2 checkpoints') !== -1);
})();

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
