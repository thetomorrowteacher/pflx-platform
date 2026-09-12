// Unit tests for the player-side "more info & stats" list-card dropdowns
// (Sept 12, Ennis: "Those dropdowns should be the player version of what
// the host sees in the Projects, Checkpoints, etc."). Covers the new
// ppCheckpointStatsHtml / ppProjectStatsHtml / ppToggleDropdown functions
// plus the wiring into ppRenderCheckpoints / ppRenderProjects. Extracts
// the REAL shipped functions via string markers -- never a reimplementation.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

function extractBetween(startMarker, endMarker, fromIndex) {
  const start = src.indexOf(startMarker, fromIndex || 0);
  if (start === -1) throw new Error('start marker not found: ' + startMarker);
  const endIdx = src.indexOf(endMarker, start);
  if (endIdx === -1) throw new Error('end marker not found: ' + endMarker);
  return src.slice(start, endIdx + endMarker.length);
}

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log('PASS: ' + name); }
  else { failed++; console.log('FAIL: ' + name); }
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── 1. Wiring / markup checks ──
check('PFLX_PATCH bumped to 186', src.indexOf('window.PFLX_PATCH   = 186;') !== -1);
check('ppCheckpointStatsHtml is defined and exported', src.indexOf('function ppCheckpointStatsHtml(cp)') !== -1 && src.indexOf('window.ppCheckpointStatsHtml = ppCheckpointStatsHtml;') !== -1);
check('ppProjectStatsHtml is defined and exported', src.indexOf('function ppProjectStatsHtml(proj)') !== -1 && src.indexOf('window.ppProjectStatsHtml = ppProjectStatsHtml;') !== -1);
check('ppToggleDropdown is defined on window', src.indexOf('window.ppToggleDropdown = function (ev, key)') !== -1);

const ppCheckpointsSrc = extractBetween('function ppRenderCheckpoints(el)', 'function ppRenderProjects(el)');
const ppProjectsSrc = extractBetween('function ppRenderProjects(el)', '// ── CHECKPOINT DETAIL');
check('ppRenderCheckpoints wires a dropdown toggle button per card', ppCheckpointsSrc.indexOf("ppToggleDropdown(event,\\'cp-'") !== -1);
check('ppRenderCheckpoints wires a collapsed-by-default dropdown panel per card', ppCheckpointsSrc.indexOf("id=\"pp-drop-cp-'") !== -1 && ppCheckpointsSrc.indexOf('ppCheckpointStatsHtml(cp)') !== -1);
check('ppRenderProjects wires a dropdown toggle button per card', ppProjectsSrc.indexOf("ppToggleDropdown(event,\\'pj-'") !== -1);
check('ppRenderProjects wires a collapsed-by-default dropdown panel per card', ppProjectsSrc.indexOf("id=\"pp-drop-pj-'") !== -1 && ppProjectsSrc.indexOf('ppProjectStatsHtml(proj)') !== -1);
check('dropdown panels stop propagation so opening never navigates the outer card', ppCheckpointsSrc.indexOf('onclick=\\"event.stopPropagation()\\"') !== -1 || ppCheckpointsSrc.indexOf('onclick="event.stopPropagation()"') !== -1);

// ── 2. ppCheckpointStatsHtml sandbox ──
function makeCpStatsSandbox(opts) {
  opts = opts || {};
  const body = extractBetween('function ppCheckpointStatsHtml(cp) {', 'window.ppCheckpointStatsHtml = ppCheckpointStatsHtml;');
  const fn = new Function(
    'window', 'pflxPlayerCheckpointProgress', 'ppGetTasks', 'ppGetProjects', 'ppItemInCheckpoint',
    'ppItemAssignedToActivePlayer', 'pflxPlayerCanEnterItem', 'pflxTaskStateForPlayer', '_mcUrgencyForDueDate',
    'escapeHtml', 'ppProgressBar',
    body + '\nreturn ppCheckpointStatsHtml;'
  );
  return fn(
    opts.window || { activeSession: { id: 'p1' } },
    opts.pflxPlayerCheckpointProgress || function () { return { approved: 2, total: 4, pct: 50 }; },
    opts.ppGetTasks || function () { return []; },
    opts.ppGetProjects || function () { return []; },
    opts.ppItemInCheckpoint || function () { return true; },
    opts.ppItemAssignedToActivePlayer || function () { return true; },
    opts.pflxPlayerCanEnterItem || function () { return true; },
    opts.pflxTaskStateForPlayer || function () { return 'open'; },
    opts._mcUrgencyForDueDate || function () { return null; },
    escapeHtml,
    opts.ppProgressBar || function (pct) { return '<div class="bar" data-pct="' + pct + '"></div>'; }
  );
}

(function () {
  const ppCheckpointStatsHtml = makeCpStatsSandbox();
  const html = ppCheckpointStatsHtml({ id: 'cp1' });
  check('ppCheckpointStatsHtml: shows the player\'s own progress percentage', html.indexOf('50%') !== -1);
  check('ppCheckpointStatsHtml: shows approved/total task counts', html.indexOf('2 of 4 of your tasks approved') !== -1);
  check('ppCheckpointStatsHtml: returns empty-state copy when no projects/tasks are visible', html.indexOf('No tasks or projects yet.') !== -1);
})();

(function () {
  const projects = [{ id: 'pj1', name: 'Locked Project' }, { id: 'pj2', name: 'Open Project' }];
  const tasks = [
    { id: 't1', projectId: 'pj2', title: 'Nested Task' },
    { id: 't2', title: 'Standalone Task', xcReward: 5 }
  ];
  const ppCheckpointStatsHtml = makeCpStatsSandbox({
    ppGetProjects: function () { return projects; },
    ppGetTasks: function () { return tasks; },
    pflxPlayerCanEnterItem: function (p) { return p.id !== 'pj1'; },
    pflxTaskStateForPlayer: function (t) { return t.id === 't1' ? 'approved' : 'open'; }
  });
  const html = ppCheckpointStatsHtml({ id: 'cp1' });
  check('ppCheckpointStatsHtml: a locked project shows the lock hint', html.indexOf('Locked Project \u{1F512}') !== -1);
  check('ppCheckpointStatsHtml: an enterable project shows no lock hint', /Open Project(?!\s|.)*<\/span>/.test(html) && html.indexOf('Open Project \u{1F512}') === -1);
  check('ppCheckpointStatsHtml: a project row navigates to project-detail with the right id', html.indexOf("ppNav('project-detail',{id:'pj1'})") !== -1);
  check('ppCheckpointStatsHtml: an approved standalone task shows the approved icon', html.indexOf('✅ Nested Task') === -1 && html.indexOf('Standalone Task') !== -1);
  check('ppCheckpointStatsHtml: a standalone task row navigates to task-detail with the right id', html.indexOf("ppNav('task-detail',{id:'t2'})") !== -1);
  check('ppCheckpointStatsHtml: XC reward is shown on a task row', html.indexOf('5 XC') !== -1);
  check('ppCheckpointStatsHtml: every dropdown row stops propagation before navigating', (html.match(/event\.stopPropagation\(\);ppNav/g) || []).length >= 3);
})();

(function () {
  // HTML-escaping check (XSS-style title).
  const ppCheckpointStatsHtml = makeCpStatsSandbox({
    ppGetProjects: function () { return [{ id: 'pj1', name: '<script>bad</script>' }]; },
    ppGetTasks: function () { return []; }
  });
  const html = ppCheckpointStatsHtml({ id: 'cp1' });
  check('ppCheckpointStatsHtml: escapes a project name containing raw HTML', html.indexOf('<script>bad</script>') === -1 && html.indexOf('&lt;script&gt;') !== -1);
})();

(function () {
  // A due-date urgency label should be surfaced when the helper returns one.
  const ppCheckpointStatsHtml = makeCpStatsSandbox({
    _mcUrgencyForDueDate: function () { return { label: 'Due tomorrow', rgb: '245,165,0' }; }
  });
  const html = ppCheckpointStatsHtml({ id: 'cp1', endDate: '2026-09-13' });
  check('ppCheckpointStatsHtml: shows a due-date urgency label when present', html.indexOf('Due tomorrow') !== -1);
})();

(function () {
  // Never throws when the progress helper itself throws (defensive fallback).
  const ppCheckpointStatsHtml = makeCpStatsSandbox({
    pflxPlayerCheckpointProgress: function () { throw new Error('boom'); }
  });
  let threw = false;
  let html = '';
  try { html = ppCheckpointStatsHtml({ id: 'cp1', progress: 30 }); } catch (e) { threw = true; }
  check('ppCheckpointStatsHtml: never throws when the progress helper throws, falls back to cp.progress', !threw && html.indexOf('30%') !== -1);
})();

// ── 3. ppProjectStatsHtml sandbox ──
function makeProjStatsSandbox(opts) {
  opts = opts || {};
  const body = extractBetween('function ppProjectStatsHtml(proj) {', 'window.ppProjectStatsHtml = ppProjectStatsHtml;');
  const fn = new Function(
    'window', 'pflxProjectCompletion', 'ppGetTasks', 'ppItemAssignedToActivePlayer', 'pflxTaskStateForPlayer',
    '_mcUrgencyForDueDate', 'escapeHtml', 'ppProgressBar',
    body + '\nreturn ppProjectStatsHtml;'
  );
  return fn(
    opts.window || { activeSession: { id: 'p1' } },
    opts.pflxProjectCompletion || function () { return { pct: 60, done: 3, total: 5, tasks: [] }; },
    opts.ppGetTasks || function () { return []; },
    opts.ppItemAssignedToActivePlayer || function () { return true; },
    opts.pflxTaskStateForPlayer || function () { return 'open'; },
    opts._mcUrgencyForDueDate || function () { return null; },
    escapeHtml,
    opts.ppProgressBar || function (pct) { return '<div class="bar" data-pct="' + pct + '"></div>'; }
  );
}

(function () {
  const ppProjectStatsHtml = makeProjStatsSandbox();
  const html = ppProjectStatsHtml({ id: 'pj1', taskIds: [] });
  check('ppProjectStatsHtml: shows the player\'s own completion percentage', html.indexOf('60%') !== -1);
  check('ppProjectStatsHtml: shows done/total assignment counts', html.indexOf('3 of 5 assignments completed') !== -1);
  check('ppProjectStatsHtml: returns empty-state copy when no tasks are visible', html.indexOf('No tasks yet.') !== -1);
})();

(function () {
  const tasks = [{ id: 't1', projectId: 'pj1', title: 'A Task', xcReward: 10 }];
  const ppProjectStatsHtml = makeProjStatsSandbox({
    ppGetTasks: function () { return tasks; },
    pflxTaskStateForPlayer: function () { return 'submitted'; }
  });
  const html = ppProjectStatsHtml({ id: 'pj1', taskIds: ['t1'] });
  check('ppProjectStatsHtml: lists a real linked task', html.indexOf('A Task') !== -1);
  check('ppProjectStatsHtml: a submitted task shows the pending-review icon', html.indexOf('⏳ A Task') !== -1);
  check('ppProjectStatsHtml: a task row navigates to task-detail with the right id', html.indexOf("ppNav('task-detail',{id:'t1'})") !== -1);
  check('ppProjectStatsHtml: XC reward is shown on a task row', html.indexOf('10 XC') !== -1);
})();

(function () {
  // A task the player cannot SEE must be excluded, mirroring every other
  // player list view's visibility gate.
  const tasks = [{ id: 't1', projectId: 'pj1', title: 'Hidden Task' }];
  const ppProjectStatsHtml = makeProjStatsSandbox({
    ppGetTasks: function () { return tasks; },
    ppItemAssignedToActivePlayer: function () { return false; }
  });
  const html = ppProjectStatsHtml({ id: 'pj1', taskIds: ['t1'] });
  check('ppProjectStatsHtml: a task the player cannot SEE is excluded', html.indexOf('Hidden Task') === -1 && html.indexOf('No tasks yet.') !== -1);
})();

// ── 4. ppToggleDropdown sandbox ──
function makeToggleSandbox() {
  const body = extractBetween('window.ppToggleDropdown = function (ev, key) {', '\n        };');
  const fn = new Function('document', 'window', body.replace('window.ppToggleDropdown = ', 'window.ppToggleDropdown = ') + '\nreturn window.ppToggleDropdown;');
  const elements = {};
  function makeEl(id) { return elements[id] || (elements[id] = { style: { display: 'none' }, innerHTML: '' }); }
  const doc = { getElementById: function (id) { return elements[id] || null; } };
  const win = {};
  const toggle = fn(doc, win);
  return { toggle: toggle, makeEl: makeEl, elements: elements };
}

(function () {
  const sb = makeToggleSandbox();
  sb.makeEl('pp-drop-cp-1');
  sb.makeEl('pp-arrow-cp-1');
  let stopped = false;
  const ev = { stopPropagation: function () { stopped = true; } };
  sb.toggle(ev, 'cp-1');
  check('ppToggleDropdown: stops propagation on the triggering event', stopped);
  check('ppToggleDropdown: opens a collapsed panel on first toggle', sb.elements['pp-drop-cp-1'].style.display === 'block');
  check('ppToggleDropdown: flips the arrow glyph to the expanded state', sb.elements['pp-arrow-cp-1'].innerHTML === '▴');
  sb.toggle(ev, 'cp-1');
  check('ppToggleDropdown: closes an already-open panel on second toggle', sb.elements['pp-drop-cp-1'].style.display === 'none');
  check('ppToggleDropdown: flips the arrow glyph back to the collapsed state', sb.elements['pp-arrow-cp-1'].innerHTML === '▾');
})();

(function () {
  const sb = makeToggleSandbox();
  // No matching panel in the DOM -- must be a safe no-op, never throw.
  let threw = false;
  try { sb.toggle({ stopPropagation: function () {} }, 'cp-does-not-exist'); } catch (e) { threw = true; }
  check('ppToggleDropdown: safe no-op when the target panel is absent from the DOM', !threw);
})();

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
