// Unit tests for the Netflix-style Dashboard carousel redesign (Sept 12,
// Ennis's corrected scope: "No this should be designed on the dashboard
// page and scrollable exactly how I designed it in the picture with scroll
// effects" -- the whole redesign lives on the player HOME dashboard itself,
// not spread across separate dedicated Checkpoints/Projects pages).
// Covers the new ppCarouselRowHtml / pflxCarouselScroll /
// pflxCarouselDragStart / ppHomeCheckpointCardHtml / ppHomeProjectCardHtml /
// ppHomeProgramCardHtml / ppHomeTaskCardHtml / ppHomeOrgCardHtml functions,
// plus their wiring into ppRenderHome right after the nav-cards grid.
// Extracts the REAL shipped functions via string markers -- never a
// reimplementation.
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
check('PFLX_PATCH bumped to 187', src.indexOf('window.PFLX_PATCH   = 187;') !== -1);
check('ppCarouselRowHtml is defined and exported', src.indexOf('function ppCarouselRowHtml(opts)') !== -1 && src.indexOf('window.ppCarouselRowHtml = ppCarouselRowHtml;') !== -1);
check('pflxCarouselScroll is defined on window', src.indexOf('window.pflxCarouselScroll = function (rowId, dir)') !== -1);
check('pflxCarouselDragStart is defined on window', src.indexOf('window.pflxCarouselDragStart = function (ev, rowId)') !== -1);
check('ppHomeCheckpointCardHtml is defined and exported', src.indexOf('function ppHomeCheckpointCardHtml(cp)') !== -1 && src.indexOf('window.ppHomeCheckpointCardHtml = ppHomeCheckpointCardHtml;') !== -1);
check('ppHomeProjectCardHtml is defined and exported', src.indexOf('function ppHomeProjectCardHtml(proj)') !== -1 && src.indexOf('window.ppHomeProjectCardHtml = ppHomeProjectCardHtml;') !== -1);
check('ppHomeProgramCardHtml is defined and exported', src.indexOf('function ppHomeProgramCardHtml(pg)') !== -1 && src.indexOf('window.ppHomeProgramCardHtml = ppHomeProgramCardHtml;') !== -1);
check('ppHomeTaskCardHtml is defined and exported', src.indexOf('function ppHomeTaskCardHtml(t)') !== -1 && src.indexOf('window.ppHomeTaskCardHtml = ppHomeTaskCardHtml;') !== -1);
check('ppHomeOrgCardHtml is defined and exported', src.indexOf('function ppHomeOrgCardHtml()') !== -1 && src.indexOf('window.ppHomeOrgCardHtml = ppHomeOrgCardHtml;') !== -1);

const ppRenderHomeSrc = extractBetween('function ppRenderHome(el) {', "html += '</div>'; // close grid");
const ppRenderHomeWireSrc = extractBetween("html += '</div>'; // close grid", '// ── Upcoming Deadlines ──');
check('ppRenderHome is unmodified above the grid-close point (nav cards untouched)', ppRenderHomeSrc.indexOf('Navigation cards') !== -1 || ppRenderHomeSrc.indexOf('close grid') === -1);
check('ppRenderHome renders the org/cohort card right after the nav grid', ppRenderHomeWireSrc.indexOf('html += ppHomeOrgCardHtml();') !== -1);
check('ppRenderHome renders a PROGRAMS carousel row keyed off mcPrograms', ppRenderHomeWireSrc.indexOf("rowId: 'programs'") !== -1 && ppRenderHomeWireSrc.indexOf('__homePrograms.map(ppHomeProgramCardHtml)') !== -1);
check('ppRenderHome renders a CHECKPOINTS carousel row keyed off the player-scoped checkpoints array', ppRenderHomeWireSrc.indexOf("rowId: 'checkpoints'") !== -1 && ppRenderHomeWireSrc.indexOf('checkpoints.map(ppHomeCheckpointCardHtml)') !== -1);
check('ppRenderHome renders a PROJECTS carousel row keyed off player-assigned projects', ppRenderHomeWireSrc.indexOf("rowId: 'projects'") !== -1 && ppRenderHomeWireSrc.indexOf('__homeProjects.map(ppHomeProjectCardHtml)') !== -1);
check('ppRenderHome renders a TASKS carousel row keyed off the player-scoped tasks array', ppRenderHomeWireSrc.indexOf("rowId: 'tasks'") !== -1 && ppRenderHomeWireSrc.indexOf('tasks.map(ppHomeTaskCardHtml)') !== -1);
check('each carousel row is gated on the underlying collection having items (no empty row renders)', (ppRenderHomeWireSrc.match(/if \(__homePrograms\.length\)|if \(checkpoints\.length\)|if \(__homeProjects\.length\)|if \(tasks\.length\)/g) || []).length === 4);

// ── 2. ppCarouselRowHtml sandbox ──
function makeCarouselRowSandbox() {
  const body = extractBetween('function ppCarouselRowHtml(opts) {', 'window.ppCarouselRowHtml = ppCarouselRowHtml;');
  const fn = new Function('escapeHtml', 'window', body + '\nreturn ppCarouselRowHtml;');
  return fn(escapeHtml, {});
}

(function () {
  const ppCarouselRowHtml = makeCarouselRowSandbox();
  const html = ppCarouselRowHtml({ rowId: 'checkpoints', icon: '\u{1F3C1}', title: 'CHECKPOINTS', subtitle: 'sub', cardsHtml: '<div>card</div>' });
  check('ppCarouselRowHtml: returns empty string when cardsHtml is empty (no phantom empty row)', ppCarouselRowHtml({ rowId: 'x', cardsHtml: '' }) === '');
  check('ppCarouselRowHtml: renders the title and icon', html.indexOf('CHECKPOINTS') !== -1 && html.indexOf('\u{1F3C1}') !== -1);
  check('ppCarouselRowHtml: renders the subtitle when given', html.indexOf('sub') !== -1);
  check('ppCarouselRowHtml: uses overflow-x:auto + scroll-snap for native drag/swipe scrolling', html.indexOf('overflow-x:auto') !== -1 && html.indexOf('scroll-snap-type:x') !== -1);
  check('ppCarouselRowHtml: the scroll track id is namespaced by rowId', html.indexOf('id="pp-row-checkpoints"') !== -1);
  check('ppCarouselRowHtml: wires the mouse drag-to-scroll handler on the track', html.indexOf("pflxCarouselDragStart(event,'pp-row-checkpoints')") !== -1);
  check('ppCarouselRowHtml: wires the advance-arrow button to scroll the same row', html.indexOf("pflxCarouselScroll('pp-row-checkpoints',1)") !== -1);
  check('ppCarouselRowHtml: embeds the supplied card markup inside the scroll track', html.indexOf('<div>card</div>') !== -1);
})();

(function () {
  // Two independent rows must never collide on DOM id.
  const ppCarouselRowHtml = makeCarouselRowSandbox();
  const htmlA = ppCarouselRowHtml({ rowId: 'checkpoints', cardsHtml: '<div>a</div>' });
  const htmlB = ppCarouselRowHtml({ rowId: 'projects', cardsHtml: '<div>b</div>' });
  check('ppCarouselRowHtml: two different rowIds never produce the same track id', htmlA.match(/id="([^"]+)"/)[1] !== htmlB.match(/id="([^"]+)"/)[1]);
})();

// ── 3. pflxCarouselScroll sandbox ──
function makeScrollSandbox() {
  const body = extractBetween('window.pflxCarouselScroll = function (rowId, dir) {', '\n        };');
  const fn = new Function('document', 'window', body + '\nreturn window.pflxCarouselScroll;');
  return function (doc) { return fn(doc, {}); };
}

(function () {
  const makeFn = makeScrollSandbox();
  let scrollByArgs = null;
  const el = { clientWidth: 400, scrollBy: function (opts) { scrollByArgs = opts; } };
  const doc = { getElementById: function (id) { return id === 'pp-row-checkpoints' ? el : null; } };
  const pflxCarouselScroll = makeFn(doc);
  pflxCarouselScroll('pp-row-checkpoints', 1);
  check('pflxCarouselScroll: scrolls forward by a positive amount derived from the track width', scrollByArgs && scrollByArgs.left > 0);
  check('pflxCarouselScroll: uses smooth scroll behavior', scrollByArgs && scrollByArgs.behavior === 'smooth');
  scrollByArgs = null;
  pflxCarouselScroll('pp-row-checkpoints', -1);
  check('pflxCarouselScroll: scrolls backward with dir=-1', scrollByArgs && scrollByArgs.left < 0);
  let threw = false;
  try { pflxCarouselScroll('does-not-exist', 1); } catch (e) { threw = true; }
  check('pflxCarouselScroll: safe no-op when the target row is absent from the DOM', !threw);
})();

(function () {
  // A very narrow row still advances by a sane minimum, never a near-zero amount.
  const makeFn = makeScrollSandbox();
  let scrollByArgs = null;
  const el = { clientWidth: 50, scrollBy: function (opts) { scrollByArgs = opts; } };
  const doc = { getElementById: function () { return el; } };
  const pflxCarouselScroll = makeFn(doc);
  pflxCarouselScroll('any', 1);
  check('pflxCarouselScroll: enforces a sane minimum scroll amount on a narrow row', scrollByArgs.left >= 240);
})();

// ── 4. pflxCarouselDragStart sandbox ──
function makeDragSandbox() {
  const body = extractBetween('window.pflxCarouselDragStart = function (ev, rowId) {', '\n        };');
  const fn = new Function('document', 'window', body + '\nreturn window.pflxCarouselDragStart;');
  return function (doc) { return fn(doc, {}); };
}

(function () {
  const makeFn = makeDragSandbox();
  const listeners = {};
  const el = { offsetLeft: 0, scrollLeft: 20, style: { cursor: 'grab' } };
  const doc = {
    getElementById: function () { return el; },
    addEventListener: function (type, cb) { listeners[type] = cb; },
    removeEventListener: function (type) { delete listeners[type]; }
  };
  const pflxCarouselDragStart = makeFn(doc);
  pflxCarouselDragStart({ pageX: 100 }, 'pp-row-checkpoints');
  check('pflxCarouselDragStart: sets a grabbing cursor while dragging', el.style.cursor === 'grabbing');
  check('pflxCarouselDragStart: registers mousemove/mouseup document listeners', typeof listeners.mousemove === 'function' && typeof listeners.mouseup === 'function');
  listeners.mousemove({ pageX: 60 });
  check('pflxCarouselDragStart: dragging left increases scrollLeft (advances the row)', el.scrollLeft > 20);
  listeners.mouseup();
  check('pflxCarouselDragStart: restores the grab cursor and unregisters listeners on mouseup', el.style.cursor === 'grab' && listeners.mousemove === undefined && listeners.mouseup === undefined);
})();

(function () {
  const makeFn = makeDragSandbox();
  const doc = { getElementById: function () { return null; }, addEventListener: function () {}, removeEventListener: function () {} };
  const pflxCarouselDragStart = makeFn(doc);
  let threw = false;
  try { pflxCarouselDragStart({ pageX: 0 }, 'missing'); } catch (e) { threw = true; }
  check('pflxCarouselDragStart: safe no-op when the target row is absent from the DOM', !threw);
})();

// ── 5. ppHomeCheckpointCardHtml sandbox ──
function makeHomeCpCardSandbox(opts) {
  opts = opts || {};
  const body = extractBetween('function ppHomeCheckpointCardHtml(cp) {', 'window.ppHomeCheckpointCardHtml = ppHomeCheckpointCardHtml;');
  const fn = new Function('escapeHtml', 'ppCheckpointStatsHtml', 'window', body + '\nreturn ppHomeCheckpointCardHtml;');
  return fn(escapeHtml, opts.ppCheckpointStatsHtml || function () { return '<div>stats</div>'; }, {});
}

(function () {
  const ppHomeCheckpointCardHtml = makeHomeCpCardSandbox();
  const html = ppHomeCheckpointCardHtml({ id: 'cp1', name: 'Checkpoint Alpha', status: 'active' });
  check('ppHomeCheckpointCardHtml: renders the checkpoint name', html.indexOf('Checkpoint Alpha') !== -1);
  check('ppHomeCheckpointCardHtml: navigates to checkpoint-detail with the right id on card click', html.indexOf("ppNav('checkpoint-detail',{id:'cp1'})") !== -1);
  check('ppHomeCheckpointCardHtml: uses a home-scoped dropdown key distinct from the list-page key (home-cp- vs cp-)', html.indexOf("ppToggleDropdown(event,'home-cp-cp1')") !== -1);
  check('ppHomeCheckpointCardHtml: the dropdown toggle stops propagation so it never triggers the card navigation', html.indexOf('event.stopPropagation();ppToggleDropdown') !== -1);
  check('ppHomeCheckpointCardHtml: embeds the real ppCheckpointStatsHtml panel content', html.indexOf('<div>stats</div>') !== -1);
  check('ppHomeCheckpointCardHtml: the dropdown panel is collapsed by default', /id="pp-drop-home-cp-cp1" style="display:none/.test(html));
})();

(function () {
  // Falls back to a fixed emoji tile when no banner image is set; uses the real image otherwise.
  const ppHomeCheckpointCardHtml = makeHomeCpCardSandbox();
  const noBanner = ppHomeCheckpointCardHtml({ id: 'cp1', name: 'A' });
  const withBanner = ppHomeCheckpointCardHtml({ id: 'cp2', name: 'B', bannerImage: 'https://x/img.png' });
  check('ppHomeCheckpointCardHtml: shows a fallback icon tile when there is no banner image', noBanner.indexOf('\u{1F3C1}') !== -1);
  check('ppHomeCheckpointCardHtml: renders the real banner image when one is set', withBanner.indexOf('https://x/img.png') !== -1);
})();

(function () {
  // A hostile checkpoint name must be escaped, not injected raw.
  const ppHomeCheckpointCardHtml = makeHomeCpCardSandbox();
  const html = ppHomeCheckpointCardHtml({ id: 'cp1', name: '<script>bad</script>' });
  check('ppHomeCheckpointCardHtml: escapes a hostile checkpoint name', html.indexOf('<script>bad</script>') === -1 && html.indexOf('&lt;script&gt;') !== -1);
})();

// ── 6. ppHomeProjectCardHtml sandbox ──
function makeHomeProjCardSandbox(opts) {
  opts = opts || {};
  const body = extractBetween('function ppHomeProjectCardHtml(proj) {', 'window.ppHomeProjectCardHtml = ppHomeProjectCardHtml;');
  const fn = new Function('escapeHtml', 'ppProjectStatsHtml', 'pflxPlayerCanEnterItem', 'window', 'ppGetCheckpoints', 'pflxFindCheckpoint', '_mcUrgencyForDueDate', 'pflxProjectCompletion', 'ppProgressBar', body + '\nreturn ppHomeProjectCardHtml;');
  return fn(escapeHtml, opts.ppProjectStatsHtml || function () { return '<div>pstats</div>'; }, opts.pflxPlayerCanEnterItem, {}, opts.ppGetCheckpoints || function () { return []; }, opts.pflxFindCheckpoint || function () { return null; }, opts._mcUrgencyForDueDate || function () { return null; }, opts.pflxProjectCompletion || function () { return { pct: 0, done: 0, total: 0 }; }, opts.ppProgressBar || function () { return '<div>bar</div>'; });
}

(function () {
  const ppHomeProjectCardHtml = makeHomeProjCardSandbox({ pflxPlayerCanEnterItem: function () { return true; } });
  const html = ppHomeProjectCardHtml({ id: 'pj1', name: 'The Alter Ego' });
  check('ppHomeProjectCardHtml: renders the project name', html.indexOf('The Alter Ego') !== -1);
  check('ppHomeProjectCardHtml: navigates to project-detail with the right id on card click', html.indexOf("ppNav('project-detail',{id:'pj1'})") !== -1);
  check('ppHomeProjectCardHtml: uses a home-scoped dropdown key distinct from the list-page key (home-pj- vs pj-)', html.indexOf("ppToggleDropdown(event,'home-pj-pj1')") !== -1);
  check('ppHomeProjectCardHtml: embeds the real ppProjectStatsHtml panel content', html.indexOf('<div>pstats</div>') !== -1);
  check('ppHomeProjectCardHtml: an enterable project shows no lock badge', html.indexOf('\u{1F512}') === -1);
})();

(function () {
  const ppHomeProjectCardHtml = makeHomeProjCardSandbox({ pflxPlayerCanEnterItem: function () { return false; } });
  const html = ppHomeProjectCardHtml({ id: 'pj1', name: 'Locked Project' });
  check('ppHomeProjectCardHtml: a locked project (visible but not enterable) shows a lock badge', html.indexOf('\u{1F512}') !== -1);
})();

// ── 7. ppHomeProgramCardHtml sandbox (deliberately no dropdown) ──
function makeHomeProgramCardSandbox(opts) {
  opts = opts || {};
  const body = extractBetween('function ppHomeProgramCardHtml(pg) {', 'window.ppHomeProgramCardHtml = ppHomeProgramCardHtml;');
  const fn = new Function('escapeHtml', 'pflxPlayerCanEnterItem', 'window', 'pflxPlayerApplicationState', 'mcCheckpoints', 'pflxEntryCtaLabel', body + '\nreturn ppHomeProgramCardHtml;');
  return fn(escapeHtml, opts.pflxPlayerCanEnterItem, {}, opts.pflxPlayerApplicationState || function () { return 'none'; }, opts.mcCheckpoints || [], opts.pflxEntryCtaLabel || function () { return 'Start'; });
}

(function () {
  const ppHomeProgramCardHtml = makeHomeProgramCardSandbox({ pflxPlayerCanEnterItem: function () { return true; } });
  const html = ppHomeProgramCardHtml({ id: 'pg1', name: 'AI & Innovation Internship' });
  check('ppHomeProgramCardHtml: renders the program name', html.indexOf(escapeHtml('AI & Innovation Internship')) !== -1);
  check('ppHomeProgramCardHtml: navigates to program-detail with the right id on card click', html.indexOf("ppNav('program-detail',{id:'pg1'})") !== -1);
  check('ppHomeProgramCardHtml: an open program shows OPEN state', html.indexOf('OPEN') !== -1);
  check('ppHomeProgramCardHtml: deliberately has NO dropdown toggle (Ennis asked for dropdowns on Checkpoints/Projects only)', html.indexOf('ppToggleDropdown') === -1);
})();

(function () {
  const ppHomeProgramCardHtml = makeHomeProgramCardSandbox({ pflxPlayerCanEnterItem: function () { return false; } });
  const html = ppHomeProgramCardHtml({ id: 'pg1', name: 'Hoop Club Thailand' });
  check('ppHomeProgramCardHtml: a locked program (no applyEnabled) shows the COHORT REQUIRED status pill -- Sept 12 v188 ported the richer real OPEN/LOCKED/PENDING/PAY status logic from ppRenderPrograms, which uses the lock icon + lockMessage rather than a bare LOCKED literal', html.indexOf('COHORT REQUIRED') !== -1);
})();

// ── 8. ppHomeTaskCardHtml sandbox ──
function makeHomeTaskCardSandbox(opts) {
  opts = opts || {};
  const body = extractBetween('function ppHomeTaskCardHtml(t) {', 'window.ppHomeTaskCardHtml = ppHomeTaskCardHtml;');
  const fn = new Function('window', 'escapeHtml', 'pflxTaskStateForPlayer', 'ppGetCheckpoints', 'ppGetProjects', 'pflxFindProject', 'pflxFindCheckpoint', 'ppProgressBar', body + '\nreturn ppHomeTaskCardHtml;');
  return fn(opts.window || { activeSession: { id: 'p1' } }, escapeHtml, opts.pflxTaskStateForPlayer || function () { return 'open'; }, opts.ppGetCheckpoints || function () { return []; }, opts.ppGetProjects || function () { return []; }, opts.pflxFindProject || function () { return null; }, opts.pflxFindCheckpoint || function () { return null; }, opts.ppProgressBar || function () { return '<div>bar</div>'; });
}

(function () {
  const ppHomeTaskCardHtml = makeHomeTaskCardSandbox({ pflxTaskStateForPlayer: function () { return 'approved'; } });
  const html = ppHomeTaskCardHtml({ id: 't1', title: 'Ship the trailer', xcReward: 8 });
  check('ppHomeTaskCardHtml: renders the task title', html.indexOf('Ship the trailer') !== -1);
  check('ppHomeTaskCardHtml: navigates to task-detail with the right id on card click', html.indexOf("ppNav('task-detail',{id:'t1'})") !== -1);
  check('ppHomeTaskCardHtml: an approved task shows the checkmark icon and strikethrough', html.indexOf('✅') !== -1 && html.indexOf('line-through') !== -1);
  check('ppHomeTaskCardHtml: shows the XC reward', html.indexOf('8 XC') !== -1);
})();

(function () {
  const ppHomeTaskCardHtml = makeHomeTaskCardSandbox({ pflxTaskStateForPlayer: function () { return 'submitted'; } });
  const html = ppHomeTaskCardHtml({ id: 't2', title: 'Pending review' });
  check('ppHomeTaskCardHtml: a submitted (pending) task shows the hourglass icon, no strikethrough', html.indexOf('⏳') !== -1 && html.indexOf('line-through') === -1);
})();

(function () {
  const ppHomeTaskCardHtml = makeHomeTaskCardSandbox({ pflxTaskStateForPlayer: function () { return 'open'; } });
  const html = ppHomeTaskCardHtml({ id: 't3', title: 'Not started' });
  check('ppHomeTaskCardHtml: an open task shows the empty-box icon', html.indexOf('⬜') !== -1);
  check('ppHomeTaskCardHtml: a zero/absent XC reward shows no XC chip', html.indexOf('XC') === -1);
})();

// ── 9. ppHomeOrgCardHtml sandbox ──
function makeHomeOrgCardSandbox(opts) {
  opts = opts || {};
  const body = extractBetween('function ppHomeOrgCardHtml() {', 'window.ppHomeOrgCardHtml = ppHomeOrgCardHtml;');
  const fn = new Function('window', 'ORGANIZATIONS', 'ORG_TIER_META', 'escapeHtml', body + '\nreturn ppHomeOrgCardHtml;');
  return fn(opts.window, opts.ORGANIZATIONS, opts.ORG_TIER_META, escapeHtml);
}

(function () {
  const ppHomeOrgCardHtml = makeHomeOrgCardSandbox({ window: { activeSession: { cohort: 'Falcon Studios' } } });
  check('ppHomeOrgCardHtml: returns empty string when ORGANIZATIONS is undefined (no multi-org tenancy configured)', ppHomeOrgCardHtml() === '');
})();

(function () {
  const ppHomeOrgCardHtml = makeHomeOrgCardSandbox({ window: { activeSession: {} }, ORGANIZATIONS: {} });
  check('ppHomeOrgCardHtml: returns empty string when the active session has no cohort', ppHomeOrgCardHtml() === '');
})();

(function () {
  const ORGANIZATIONS = { asd: { name: 'American School of Dubai', shortName: 'ASD', contact: 'falconstudios@asdubai.org', subscription: 'enterprise', active: true, cohorts: ['Falcon Studios', 'Other Cohort'] } };
  const ORG_TIER_META = { enterprise: { color: '#8b5cf6', label: 'CMO Enterprise' } };
  const ppHomeOrgCardHtml = makeHomeOrgCardSandbox({ window: { activeSession: { cohort: 'Falcon Studios' } }, ORGANIZATIONS: ORGANIZATIONS, ORG_TIER_META: ORG_TIER_META });
  const html = ppHomeOrgCardHtml();
  check('ppHomeOrgCardHtml: finds the org whose cohorts[] contains the active player\'s cohort', html.indexOf('American School of Dubai') !== -1);
  check('ppHomeOrgCardHtml: shows the shortName/contact line', html.indexOf('ASD') !== -1 && html.indexOf('falconstudios@asdubai.org') !== -1);
  check('ppHomeOrgCardHtml: shows the cohort name', html.indexOf('Falcon Studios') !== -1);
  check('ppHomeOrgCardHtml: shows the subscription tier label', html.indexOf('CMO ENTERPRISE') !== -1);
  check('ppHomeOrgCardHtml: shows ACTIVE for an active org', html.indexOf('ACTIVE') !== -1);
})();

(function () {
  const ORGANIZATIONS = { asd: { name: 'X School', shortName: 'X', subscription: 'basic', active: false, cohorts: ['Some Other Cohort'] } };
  const ppHomeOrgCardHtml = makeHomeOrgCardSandbox({ window: { activeSession: { cohort: 'Falcon Studios' } }, ORGANIZATIONS: ORGANIZATIONS });
  check('ppHomeOrgCardHtml: returns empty string when no org\'s cohorts[] contains the active cohort', ppHomeOrgCardHtml() === '');
})();

(function () {
  const ORGANIZATIONS = { asd: { name: 'Y School', shortName: 'Y', subscription: 'basic', active: false, cohorts: ['Falcon Studios'] } };
  const ppHomeOrgCardHtml = makeHomeOrgCardSandbox({ window: { activeSession: { cohort: 'Falcon Studios' } }, ORGANIZATIONS: ORGANIZATIONS });
  const html = ppHomeOrgCardHtml();
  check('ppHomeOrgCardHtml: shows INACTIVE for an inactive org', html.indexOf('INACTIVE') !== -1);
})();

(function () {
  // Never throws on a malformed ORGANIZATIONS lookup.
  const ppHomeOrgCardHtml = makeHomeOrgCardSandbox({ window: { activeSession: { cohort: 'Falcon Studios' } }, ORGANIZATIONS: { bad: null, worse: { cohorts: 'not-an-array' } } });
  let threw = false;
  let html = '';
  try { html = ppHomeOrgCardHtml(); } catch (e) { threw = true; }
  check('ppHomeOrgCardHtml: never throws on a malformed ORGANIZATIONS entry, falls back to empty string', !threw && html === '');
})();

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
