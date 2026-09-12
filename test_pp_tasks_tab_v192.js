// PATCH PLATFORM v192 -- My Tasks tab redesign unit test.
// Extracts the real shipped functions from preview.html via brace-counting
// (never a reimplementation) and runs them in a sandboxed harness, mirroring
// the pattern established in test_pp_projects_tab_v190.js /
// test_pp_checkpoints_tab_v191.js.

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
    // consume trailing semicolon if present
    if (src[i] === ';') i++;
    return src.slice(start, i);
}

// ---- Static checks ----
check('PFLX_PATCH bumped to 192', /window\.PFLX_PATCH\s*=\s*192;/.test(src));
check('ppTaskFlpBucketFor defined', src.indexOf('function ppTaskFlpBucketFor(t, pid)') !== -1);
check('ppTaskFlpBucketFor exported on window', src.indexOf('window.ppTaskFlpBucketFor = ppTaskFlpBucketFor;') !== -1);
check('ppTaskFlpBucketFor uses PER-PLAYER completion (pflxTaskStateForPlayer), not global .status alone',
    extractFn('ppTaskFlpBucketFor').indexOf('pflxTaskStateForPlayer') !== -1);

const mtSrc = extractFn('ppRenderMyTasks');
check('ppRenderMyTasks applies card size with pptasks key', mtSrc.indexOf("pflxApplyCardSize('pptasks')") !== -1);
check('ppRenderMyTasks renders the card-size slider with pptasks key', mtSrc.indexOf("pflxCardSizeSliderHtml('pptasks', 'Task')") !== -1);
check('ppRenderMyTasks reuses the shared ppBucketedSectionsHtml helper', mtSrc.indexOf('ppBucketedSectionsHtml(') !== -1);
check('ppRenderMyTasks reuses the shared PP_FLP_BUCKET_META/ORDER (not a new bucket system)',
    mtSrc.indexOf('PP_FLP_BUCKET_META') !== -1 && mtSrc.indexOf('PP_FLP_BUCKET_ORDER') !== -1);
check('ppRenderMyTasks wraps output in the ppmc-tasks-list grid container', mtSrc.indexOf('id="ppmc-tasks-list"') !== -1);
check('ppRenderMyTasks classifies via ppTaskFlpBucketFor(t, __mtPid), the per-player classifier', mtSrc.indexOf('ppTaskFlpBucketFor(t, __mtPid)') !== -1);
check('ppRenderMyTasks does NOT call the global-status ppFlpBucketFor directly', !/[^k]ppFlpBucketFor\(t[,)]/.test(mtSrc.replace('ppTaskFlpBucketFor', '')));
check('overall progress bar retained', mtSrc.indexOf('OVERALL PROGRESS') !== -1);
check('empty state message retained', mtSrc.indexOf('NO TASKS ASSIGNED') !== -1);

// ---- Sandbox: classifier in isolation ----
function makeClassifierSandbox() {
    const body = extractFn('ppTaskFlpBucketFor');
    const flpStatusStub = { impl: null };
    const sandbox = new Function(
        'pflxTaskStateForPlayer', 'pflxComputeFlpStatus',
        body + '\nreturn ppTaskFlpBucketFor;'
    );
    return sandbox;
}

(function () {
    const pflxTaskStateForPlayer = function (t, pid) { return t.__stateFor && t.__stateFor[pid]; };
    // NOTE: the real ppTaskFlpBucketFor constructs a NEW object to pass to
    // pflxComputeFlpStatus -- { flpTracking, startedAt, dueDate } only, so a
    // fixture field like `__phase` on the task never actually reaches this
    // stub. Encode the desired phase inside `dueDate` instead, since that's
    // the one field that genuinely flows through unchanged.
    const pflxComputeFlpStatus = function (opts) {
        return (typeof opts.dueDate === 'string' && opts.dueDate.indexOf('PHASE:') === 0)
            ? { phase: opts.dueDate.slice(6) } : null;
    };
    const classify = makeClassifierSandbox()(pflxTaskStateForPlayer, pflxComputeFlpStatus);

    check('classifier: approved-for-this-player -> completed', classify({ __stateFor: { p1: 'approved' } }, 'p1') === 'completed');
    check('classifier: approved for a DIFFERENT player only -> NOT completed for me (per-player, not global)',
        classify({ __stateFor: { p2: 'approved' } }, 'p1') !== 'completed');
    check('classifier: flpTracking not monitoring -> bypass', classify({ flpTracking: 'off' }, 'p1') === 'bypass');
    check('classifier: monitoring but not started -> not-started', classify({ flpTracking: 'monitoring' }, 'p1') === 'not-started');
    check('classifier: monitoring + started + real phase -> that phase',
        classify({ flpTracking: 'monitoring', startedAt: 123, dueDate: 'PHASE:development' }, 'p1') === 'development');
    check('classifier: monitoring + started + no computable phase -> engagement fallback',
        classify({ flpTracking: 'monitoring', startedAt: 123 }, 'p1') === 'engagement');
    check('classifier: never throws on a bare {} task', (function () { try { classify({}, 'p1'); return true; } catch (e) { return false; } })());
    check('classifier: never throws on a null pid', (function () { try { classify({ flpTracking: 'monitoring', startedAt: 1 }, null); return true; } catch (e) { return false; } })());
    check('classifier: t.completed=true (legacy field, no pflxTaskStateForPlayer) -> completed',
        (function () {
            const c2 = new Function('pflxComputeFlpStatus', extractFn('ppTaskFlpBucketFor') + '\nreturn ppTaskFlpBucketFor;')(pflxComputeFlpStatus);
            return c2({ completed: true }, 'p1') === 'completed';
        })());
})();

// ---- Sandbox: full ppRenderMyTasks render harness ----
function makeTasksSandbox() {
    const escapeHtml = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
    const PP_FLP_BUCKET_META_SRC = extractVar('PP_FLP_BUCKET_META');
    const PP_FLP_BUCKET_ORDER_SRC = extractVar('PP_FLP_BUCKET_ORDER');
    const ppBucketedSectionsHtmlSrc = extractFn('ppBucketedSectionsHtml');
    const ppTaskFlpBucketForSrc = extractFn('ppTaskFlpBucketFor');
    const ppRenderMyTasksSrc = extractFn('ppRenderMyTasks');

    const body = PP_FLP_BUCKET_META_SRC + '\n' + PP_FLP_BUCKET_ORDER_SRC + '\n' +
        ppBucketedSectionsHtmlSrc + '\n' + ppTaskFlpBucketForSrc + '\n' + ppRenderMyTasksSrc +
        '\nreturn ppRenderMyTasks;';

    const factory = new Function(
        'escapeHtml', 'ppGetTasks', 'ppItemAssignedToActivePlayer', 'window', 'ppBreadcrumb',
        'pflxApplyCardSize', 'pflxCardSizeSliderHtml', 'ppProgressBar', 'pflxTaskStateForPlayer',
        '_mcPriorityWeight', '_mcUrgencyForDueDate', '_mcPriorityFlag', 'pflxComputeFlpStatus',
        body
    );
    return factory;
}

function runTasks(tasks, opts) {
    opts = opts || {};
    const calls = { applyCardSize: [], sliderHtml: [] };
    const escapeHtml = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
    const ppGetTasks = function () { return tasks; };
    const ppItemAssignedToActivePlayer = function () { return true; };
    const window = { activeSession: { id: opts.pid || 'me' } };
    const ppBreadcrumb = function () { return '<div class="crumb"></div>'; };
    const pflxApplyCardSize = function (key) { calls.applyCardSize.push(key); };
    const pflxCardSizeSliderHtml = function (key, label) { calls.sliderHtml.push([key, label]); return '<div class="slider" data-key="' + key + '"></div>'; };
    const ppProgressBar = function (pct, color) { return '<div class="bar" data-pct="' + pct + '" data-color="' + color + '"></div>'; };
    const pflxTaskStateForPlayer = function (t, pid) { return (t.__stateFor && t.__stateFor[pid]) || null; };
    const _mcPriorityWeight = function (p) { return ({ low: 1, normal: 2, high: 3, urgent: 4 })[p] || 2; };
    const _mcUrgencyForDueDate = function () { return { color: 'grey', rgb: '156,163,175', label: 'No deadline', days: 999 }; };
    const _mcPriorityFlag = function () { return ''; };
    // Same PHASE: dueDate-encoding as the classifier-isolation sandbox above
    // -- __phase never reaches this stub since the real function only
    // forwards { flpTracking, startedAt, dueDate } to pflxComputeFlpStatus.
    const pflxComputeFlpStatus = function (opts2) {
        return (typeof opts2.dueDate === 'string' && opts2.dueDate.indexOf('PHASE:') === 0)
            ? { phase: opts2.dueDate.slice(6) } : null;
    };

    const ppRenderMyTasksFn = makeTasksSandbox()(
        escapeHtml, ppGetTasks, ppItemAssignedToActivePlayer, window, ppBreadcrumb,
        pflxApplyCardSize, pflxCardSizeSliderHtml, ppProgressBar, pflxTaskStateForPlayer,
        _mcPriorityWeight, _mcUrgencyForDueDate, _mcPriorityFlag, pflxComputeFlpStatus
    );
    const el = { innerHTML: '' };
    ppRenderMyTasksFn(el);
    return { html: el.innerHTML, calls: calls };
}

(function () {
    const r = runTasks([]);
    check('empty tasks: no tasks assigned message shown', r.html.indexOf('NO TASKS ASSIGNED') !== -1);
})();

(function () {
    const r = runTasks([{ id: 't1', title: 'Read Chapter 1', flpTracking: 'monitoring', startedAt: 100, dueDate: 'PHASE:development', __stateFor: {} }]);
    check('single in-progress task: shows Development bucket banner', r.html.indexOf('Development') !== -1);
    check('applies card size on render with pptasks key', r.calls.applyCardSize.indexOf('pptasks') !== -1);
    check('renders the card-size slider with pptasks key', r.calls.sliderHtml.some(function (c) { return c[0] === 'pptasks'; }));
    check('wraps output in the ppmc-tasks-list grid container', r.html.indexOf('id="ppmc-tasks-list"') !== -1);
    check('task title present', r.html.indexOf('Read Chapter 1') !== -1);
    check('overall progress line present', r.html.indexOf('OVERALL PROGRESS') !== -1);
})();

(function () {
    const r = runTasks([{ id: 't2', title: 'Bypass Task', flpTracking: 'off', __stateFor: {} }]);
    check('bypass (non-monitored) task lands in Bypass bucket', r.html.indexOf('Bypass') !== -1);
})();

(function () {
    const r = runTasks([{ id: 't3', title: 'Not Yet Started', flpTracking: 'monitoring', __stateFor: {} }]);
    check('monitored-but-not-started task lands in Not Started bucket', r.html.indexOf('Not Started') !== -1);
})();

(function () {
    const r = runTasks([{ id: 't4', title: 'My Done Task', flpTracking: 'monitoring', startedAt: 1, dueDate: 'PHASE:development', __stateFor: { me: 'approved' } }], { pid: 'me' });
    check('a task approved for ME lands in Completed bucket', r.html.indexOf('Completed') !== -1);
})();

(function () {
    // The critical per-player regression guard: a task approved for a
    // DIFFERENT player must NOT show as completed on MY row (the exact bug
    // class the Sept 4 fix closed for this same tab).
    const r = runTasks([{ id: 't5', title: 'Shared Task', flpTracking: 'monitoring', startedAt: 1, dueDate: 'PHASE:engagement', __stateFor: { someoneElse: 'approved' } }], { pid: 'me' });
    check('a task approved for ANOTHER player only does NOT show as Completed for me', r.html.indexOf('Completed') === -1);
    check('that same task instead lands in its real in-progress phase bucket (Engagement)', r.html.indexOf('Engagement') !== -1);
})();

(function () {
    const r = runTasks([
        { id: 't6', title: 'Done E', flpTracking: 'monitoring', startedAt: 1, dueDate: 'PHASE:engagement', __stateFor: { me: 'approved' } },
        { id: 't7', title: 'Bypass F', flpTracking: 'off', __stateFor: {} },
        { id: 't8', title: 'Started G', flpTracking: 'monitoring', startedAt: 1, dueDate: 'PHASE:development', __stateFor: {} },
        { id: 't9', title: 'NotStarted H', flpTracking: 'monitoring', __stateFor: {} }
    ], { pid: 'me' });
    const idxDev = r.html.indexOf('Started G');
    const idxBypass = r.html.indexOf('Bypass F');
    const idxNotStarted = r.html.indexOf('NotStarted H');
    const idxDone = r.html.indexOf('Done E');
    check('multi-bucket render: all four task names present',
        idxDev !== -1 && idxBypass !== -1 && idxNotStarted !== -1 && idxDone !== -1);
    check('bucket order respected: development before not-started before bypass before completed',
        idxDev < idxNotStarted && idxNotStarted < idxBypass && idxBypass < idxDone);
})();

(function () {
    const r = runTasks([{ id: 't10', title: 'Only One', flpTracking: 'monitoring', startedAt: 1, dueDate: 'PHASE:engagement', __stateFor: {} }]);
    check('empty buckets render no banner (Completed not present)', r.html.indexOf('Completed') === -1);
    check('empty buckets render no banner (Bypass not present)', r.html.indexOf('Bypass') === -1);
})();

(function () {
    const r = runTasks([{ id: 't11', title: '<script>alert(1)</script>', flpTracking: 'off', __stateFor: {} }]);
    check('task title still escaped inside the bucketed grid', r.html.indexOf('<script>alert(1)</script>') === -1);
})();

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
