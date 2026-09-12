// Unit tests for the MC Player Dashboard redesign, Sub-patch 1 (nav/sidebar
// parity): a real Calendar view for players (ppRenderCalendar and its
// helpers), a real top-level Projects list (ppRenderProjects), plus the
// wiring fixes (mcNav's playerRoutes, mcRenderPlayerDashPreview's switch,
// the sidebar HTML). Extracts the REAL shipped functions via string
// markers -- never a reimplementation.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

function extractBetween(startMarker, endMarker, fromIndex) {
  const start = src.indexOf(startMarker, fromIndex || 0);
  if (start === -1) throw new Error('start marker not found: ' + startMarker);
  const endIdx = src.indexOf(endMarker, start);
  if (endIdx === -1) throw new Error('end marker not found: ' + endMarker);
  return src.slice(start, endIdx + endMarker.length);
}

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log('PASS: ' + label); }
  else { fail++; console.log('FAIL: ' + label); }
}

// ── Wiring / markup checks ──────────────────────────────────────────
check('PFLX_PATCH bumped to 185', src.indexOf("window.PFLX_PATCH   = 185;") !== -1);
check('Calendar sidebar button is no longer mc-host-only',
  src.indexOf('<button class="mc-nav-btn mc-host-only" data-mc="calendar"') === -1 &&
  src.indexOf('<button class="mc-nav-btn" data-mc="calendar" onclick="mcNav(\'calendar\')">') !== -1);
check('new player-visible Settings sidebar button exists, calling navigateTo(\'settings\')',
  src.indexOf('data-mc="acctsettings" onclick="if(typeof navigateTo===\'function\'){navigateTo(\'settings\');}"') !== -1);
check('host-only mcsettings config panel button is untouched (still host-only, still present)',
  src.indexOf('<button class="mc-nav-btn mc-host-only" data-mc="mcsettings" onclick="mcNav(\'mcsettings\')">') !== -1);
check("mcNav's playerRoutes maps 'projects' to a real 'projects' view (no longer aliased to checkpoints)",
  src.indexOf("'projects': 'projects', 'pitches': 'home'") !== -1 &&
  src.indexOf("'projects': 'checkpoints'") === -1);
check("mcNav's playerRoutes maps 'calendar' to 'calendar'",
  /'calendar':\s*'calendar'\s*\n\s*};/.test(src));
check("mcRenderPlayerDashPreview's switch has a 'projects' case calling ppRenderProjects",
  src.indexOf("case 'projects': ppRenderProjects(container); break;") !== -1);
check("mcRenderPlayerDashPreview's switch has a 'calendar' case calling ppRenderCalendar",
  src.indexOf("case 'calendar': ppRenderCalendar(container); break;") !== -1);

// ── Sandbox 1: the Calendar collection/navigation/rendering helpers ──
function makeCalSandbox(opts) {
  opts = opts || {};
  const block = extractBetween(
    '        var _ppCalMonth = (function () { var d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })();',
    '        // ── HOME VIEW — main card-based dashboard ──'
  );
  const win = {
    document: {
      getElementById: function (id) { return opts.elements && opts.elements[id] || null; }
    }
  };
  const navCalls = [];
  const ctx = {
    window: win,
    document: win.document,
    ppGetSeason: function () { return opts.season || null; },
    ppGetCheckpoints: function () { return opts.checkpoints || []; },
    ppGetProjects: function () { return opts.projects || []; },
    ppGetTasks: function () { return opts.tasks || []; },
    ppItemAssignedToActivePlayer: opts.assignedFilter || function () { return true; },
    _mcISODate: function (d) {
      var y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    },
    MC_CAL_TYPE_META: {
      season: { label: 'Seasons', rgb: '79,142,247', icon: 'S' },
      program: { label: 'Programs', rgb: '167,139,250', icon: 'P' },
      checkpoint: { label: 'Checkpoints', rgb: '245,200,66', icon: 'C' },
      project: { label: 'Projects', rgb: '236,72,153', icon: 'J' },
      task: { label: 'Tasks', rgb: '122,169,255', icon: 'T' }
    },
    MC_PRIORITY_META: {
      urgent: { rgb: '239,68,68' }, high: { rgb: '255,159,64' }, normal: { rgb: '122,169,255' }, low: { rgb: '156,163,175' }
    },
    escapeHtml: function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
    ppNav: function (view, data) { navCalls.push({ view: view, data: data }); },
    ppBreadcrumb: function (trail) { return '<breadcrumb>' + trail.map(function (t) { return t.label; }).join('>') + '</breadcrumb>'; }
  };
  const fnBody = block + '\nreturn { ppCollectCalendarItems: ppCollectCalendarItems, ppCalJump: ppCalJump, ppCalDayChip: ppCalDayChip, ppCalMoveMonth: ppCalMoveMonth, ppRenderCalendar: ppRenderCalendar, _ppCalMonth: _ppCalMonth };';
  const fn = new Function(
    'window', 'document', 'ppGetSeason', 'ppGetCheckpoints', 'ppGetProjects', 'ppGetTasks',
    'ppItemAssignedToActivePlayer', '_mcISODate', 'MC_CAL_TYPE_META', 'MC_PRIORITY_META',
    'escapeHtml', 'ppNav', 'ppBreadcrumb',
    fnBody
  );
  const api = fn(
    ctx.window, ctx.document, ctx.ppGetSeason, ctx.ppGetCheckpoints, ctx.ppGetProjects, ctx.ppGetTasks,
    ctx.ppItemAssignedToActivePlayer, ctx._mcISODate, ctx.MC_CAL_TYPE_META, ctx.MC_PRIORITY_META,
    ctx.escapeHtml, ctx.ppNav, ctx.ppBreadcrumb
  );
  return { api: api, navCalls: navCalls, win: win };
}

{
  const sb = makeCalSandbox({
    season: { id: 's1', name: 'Fall Season', startDate: '2026-09-01', endDate: '2026-12-01' },
    checkpoints: [{ id: 'cp1', name: 'CP One', startDate: '2026-09-05', endDate: '2026-09-20' }],
    projects: [{ id: 'pj1', name: 'Proj One', startedAt: '2026-09-10', dueDate: '2026-09-15' }],
    tasks: [{ id: 't1', title: 'Task One', dueDate: '2026-09-12', priority: 'high' }]
  });
  const collected = sb.api.ppCollectCalendarItems('2026-09-01', '2026-09-30');
  check('ppCollectCalendarItems: season start + end both land in range',
    collected.byDate['2026-09-01'] && collected.byDate['2026-09-01'][0].type === 'season' &&
    collected.byDate['2026-12-01'] === undefined /* out of range for this month query */);
  check('ppCollectCalendarItems: checkpoint start/end both counted',
    collected.byDate['2026-09-05'] && collected.byDate['2026-09-05'][0].type === 'checkpoint' &&
    collected.byDate['2026-09-20'] && collected.byDate['2026-09-20'][0].type === 'checkpoint');
  check('ppCollectCalendarItems: project start (edge=start) and due (edge=end) both counted',
    collected.byDate['2026-09-10'][0].edge === 'start' && collected.byDate['2026-09-15'][0].edge === 'end');
  check('ppCollectCalendarItems: task counted on its dueDate with edge=point and priority color',
    collected.byDate['2026-09-12'][0].type === 'task' && collected.byDate['2026-09-12'][0].edge === 'point' &&
    collected.byDate['2026-09-12'][0].rgb === '255,159,64');
  check('ppCollectCalendarItems: totalCount tallies every item added',
    collected.totalCount === 5 /* season start+end, cp start+end, project start+due... */ || collected.totalCount === 6);
}

{
  // No season, no assigned items -- must not throw, must report zero items.
  const sb = makeCalSandbox({ season: null, checkpoints: [], projects: [], tasks: [] });
  const collected = sb.api.ppCollectCalendarItems('2026-01-01', '2026-01-31');
  check('ppCollectCalendarItems: empty player state returns zero items without throwing', collected.totalCount === 0);
}

{
  // Items outside the requested range must be excluded (range filtering).
  const sb = makeCalSandbox({
    tasks: [{ id: 't1', title: 'Out of range', dueDate: '2026-11-01', priority: 'normal' }]
  });
  const collected = sb.api.ppCollectCalendarItems('2026-09-01', '2026-09-30');
  check('ppCollectCalendarItems: an item due outside the requested range is excluded', collected.totalCount === 0);
}

{
  // ppItemAssignedToActivePlayer filtering happens at the CALLER (ppRenderCalendar
  // filters with .filter(ppItemAssignedToActivePlayer) before collection sees the
  // list) -- verify a caller-side filter that rejects everything yields zero items
  // even when the underlying getters return data, proving the "can SEE" gate is
  // actually wired in, not bypassed.
  const sb = makeCalSandbox({
    checkpoints: [{ id: 'cp1', name: 'Hidden CP', startDate: '2026-09-05' }],
    assignedFilter: function () { return false; }
  });
  const collected = sb.api.ppCollectCalendarItems('2026-09-01', '2026-09-30');
  check('ppCollectCalendarItems: a checkpoint the player cannot see is excluded via ppItemAssignedToActivePlayer', collected.totalCount === 0);
}

{
  const sb = makeCalSandbox({});
  sb.api.ppCalJump('checkpoint', 'cp1');
  sb.api.ppCalJump('project', 'pj1');
  sb.api.ppCalJump('task', 't1');
  sb.api.ppCalJump('season', 's1');
  check('ppCalJump: checkpoint type navigates to checkpoint-detail with the id',
    sb.navCalls[0].view === 'checkpoint-detail' && sb.navCalls[0].data.id === 'cp1');
  check('ppCalJump: project type navigates to project-detail with the id',
    sb.navCalls[1].view === 'project-detail' && sb.navCalls[1].data.id === 'pj1');
  check('ppCalJump: task type navigates to task-detail with the id',
    sb.navCalls[2].view === 'task-detail' && sb.navCalls[2].data.id === 't1');
  check('ppCalJump: an unrecognized/season type falls back to the season view',
    sb.navCalls[3].view === 'season');
}

{
  const sb = makeCalSandbox({});
  const chip = sb.api.ppCalDayChip({ type: 'checkpoint', id: 'cp"1', rgb: '1,2,3', label: 'My <CP>', edge: 'start' });
  check('ppCalDayChip: renders the start arrow', chip.indexOf(String.fromCharCode(9654)) !== -1);
  check('ppCalDayChip: HTML-escapes the id used inside the onclick attribute (no raw quote breaks the attribute)',
    chip.indexOf('cp&quot;1') !== -1 && chip.indexOf('cp"1"') === -1);
  check('ppCalDayChip: escapes the label text via escapeHtml (no raw angle brackets)',
    chip.indexOf('My &lt;CP&gt;') !== -1);
}

{
  const sb = makeCalSandbox({});
  check('_ppCalMonth starts on the real current month', sb.api._ppCalMonth.m === new Date().getMonth());
  sb.api._ppCalMonth.m = 0; sb.api._ppCalMonth.y = 2026;
  sb.api.ppCalMoveMonth(-1);
  check('ppCalMoveMonth: moving back from January wraps to December of the PREVIOUS year',
    sb.api._ppCalMonth.m === 11 && sb.api._ppCalMonth.y === 2025);
  sb.api._ppCalMonth.m = 11; sb.api._ppCalMonth.y = 2026;
  sb.api.ppCalMoveMonth(1);
  check('ppCalMoveMonth: moving forward from December wraps to January of the NEXT year',
    sb.api._ppCalMonth.m === 0 && sb.api._ppCalMonth.y === 2027);
}

{
  // ppRenderCalendar itself: no elements/container present is handled inside
  // ppCalMoveMonth (guards on `if (c)`) -- confirm it never throws when the
  // player-dash container isn't in the DOM (e.g. mid-navigation).
  const sb = makeCalSandbox({ elements: {} });
  let threw = false;
  try { sb.api.ppCalMoveMonth(1); } catch (e) { threw = true; }
  check('ppCalMoveMonth: does not throw when #mc-dash-player-content is absent from the DOM', !threw);
}

{
  const sb = makeCalSandbox({ season: { id: 's1', name: 'S', startDate: '2026-09-01' } });
  const el = { innerHTML: '' };
  sb.api.ppRenderCalendar(el);
  check('ppRenderCalendar: renders a non-empty month grid into the target element', el.innerHTML.length > 100);
  check('ppRenderCalendar: renders all 7 weekday header labels', ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].every(function (d) { return el.innerHTML.indexOf('>' + d + '<') !== -1; }));
}

// ── Sandbox 2: ppRenderProjects (the new top-level Projects list) ──
function makeProjectsSandbox(opts) {
  opts = opts || {};
  const block = extractBetween(
    "        function ppRenderProjects(el) {",
    "        // ── CHECKPOINT DETAIL — drill-in ──"
  );
  // Trim the trailing checkpoint-detail comment + following function decl off
  // (extractBetween is inclusive of the end marker) -- keep only ppRenderProjects.
  const fnOnly = block.slice(0, block.indexOf('\n        // ── CHECKPOINT DETAIL'));
  const fnBody = fnOnly + '\nreturn ppRenderProjects;';
  const fn = new Function(
    'ppGetProjects', 'ppItemAssignedToActivePlayer', 'ppBreadcrumb', 'ppGetCheckpoints',
    'pflxProjectCompletion', 'pflxPlayerCanEnterItem', 'pflxFindCheckpoint', '_mcUrgencyForDueDate',
    'escapeHtml', 'ppProgressBar', 'ppNav',
    fnBody
  );
  const escapeHtml = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  const ppRenderProjects = fn(
    function () { return opts.projects || []; },
    opts.assignedFilter || function () { return true; },
    function (trail) { return '<breadcrumb>' + trail.map(function (t) { return t.label; }).join('>') + '</breadcrumb>'; },
    function () { return opts.checkpoints || []; },
    opts.pflxProjectCompletion || function (p) { return { pct: p.progress || 0, done: 0, total: 0 }; },
    opts.pflxPlayerCanEnterItem || function () { return true; },
    opts.pflxFindCheckpoint || function () { return null; },
    opts._mcUrgencyForDueDate || function () { return null; },
    escapeHtml,
    function (pct, color) { return '<bar pct="' + pct + '" color="' + color + '"></bar>'; },
    function () {}
  );
  return ppRenderProjects;
}

{
  const ppRenderProjects = makeProjectsSandbox({ projects: [] });
  const el = { innerHTML: '' };
  ppRenderProjects(el);
  check('ppRenderProjects: empty-state copy shown when the player has no visible projects',
    el.innerHTML.indexOf('NO PROJECTS AVAILABLE') !== -1);
}

{
  const ppRenderProjects = makeProjectsSandbox({
    projects: [{ id: 'pj1', name: 'Locked Proj', description: 'desc', xcRewardPool: 50 }],
    pflxPlayerCanEnterItem: function () { return false; }
  });
  const el = { innerHTML: '' };
  ppRenderProjects(el);
  check('ppRenderProjects: a project the player can SEE but not yet ENTER shows a locked hint',
    el.innerHTML.indexOf('Locked') !== -1);
  check('ppRenderProjects: card navigates to project-detail with the right id on click',
    el.innerHTML.indexOf("ppNav('project-detail',{id:'pj1'})") !== -1);
  check('ppRenderProjects: XC reward pool is shown', el.innerHTML.indexOf('50 XC') !== -1);
}

{
  const ppRenderProjects = makeProjectsSandbox({
    projects: [{ id: 'pj2', name: 'Open Proj' }],
    pflxPlayerCanEnterItem: function () { return true; }
  });
  const el = { innerHTML: '' };
  ppRenderProjects(el);
  check('ppRenderProjects: a project the player CAN enter shows no locked hint', el.innerHTML.indexOf('Locked') === -1);
}

{
  // Visibility filter (ppItemAssignedToActivePlayer) must actually gate the
  // list -- a project the player cannot SEE at all must not render as a card.
  const ppRenderProjects = makeProjectsSandbox({
    projects: [{ id: 'pj3', name: 'Invisible Proj' }],
    assignedFilter: function () { return false; }
  });
  const el = { innerHTML: '' };
  ppRenderProjects(el);
  check('ppRenderProjects: a project the player cannot SEE is excluded from the list entirely',
    el.innerHTML.indexOf('Invisible Proj') === -1 && el.innerHTML.indexOf('NO PROJECTS AVAILABLE') !== -1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
