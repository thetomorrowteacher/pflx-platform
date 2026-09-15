// PATCH PLATFORM v204 -- Mission Dashboard: Programs section, real 16:9
// cover-art cards for Checkpoints/Projects, and the Organization/Cohort
// banner. Extracts the REAL shipped mcDashCardHtml function (brace-matched
// from source, never reimplemented) plus does structural presence checks
// on the real mcRenderDashboard source for the parts that are DOM-driven
// (org banner mount, Programs section, grid containers, edit/delete wiring)
// since a full DOM simulation of mcRenderDashboard's many dependent mc*
// globals is out of proportion to what this patch actually changed.

const fs = require('fs');
const path = process.argv[2];
if (!path) { console.error('usage: node test_mc_dashboard_v204.js <preview.html>'); process.exit(1); }
const src = fs.readFileSync(path, 'utf8');

let pass = 0, fail = 0;
function check(label, cond) {
    if (cond) { pass++; console.log('PASS:', label); }
    else { fail++; console.log('FAIL:', label); }
}

// ── Extract the real mcDashCardHtml function body by brace-matching ──
function extractFn(src, marker) {
    const start = src.indexOf(marker);
    if (start === -1) return null;
    const braceStart = src.indexOf('{', start);
    let depth = 0, i = braceStart;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    return src.slice(start, i);
}

const cardFnSrc = extractFn(src, 'function mcDashCardHtml(opts) {');
check('mcDashCardHtml extracted from real source', !!cardFnSrc);

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const sandbox = {};
const fnBody = 'window.escapeHtml = escapeHtml; window.pflxCoverMediaEl = pflxCoverMediaEl;\n' + cardFnSrc + '\nreturn mcDashCardHtml;';
const factory = new Function('window', 'escapeHtml', 'pflxCoverMediaEl', fnBody);
let pflxCoverMediaElCalls = [];
function pflxCoverMediaEl(embedUrl, imgUrl) {
    pflxCoverMediaElCalls.push([embedUrl, imgUrl]);
    return '<img src="' + escapeHtml(imgUrl || '') + '">';
}
const mcDashCardHtml = factory({}, escapeHtml, pflxCoverMediaEl);

// 1) No bannerImage/embedUrl -> gradient fallback with icon, no pflxCoverMediaEl call
pflxCoverMediaElCalls = [];
let html1 = mcDashCardHtml({ icon: '\u{1F4D0}', title: 'My Program', accentRgb: '74,222,128' });
check('fallback card: gradient background used (no cover media)', html1.indexOf('linear-gradient') !== -1);
check('fallback card: icon rendered in placeholder', html1.indexOf('\u{1F4D0}') !== -1);
check('fallback card: pflxCoverMediaEl NOT called', pflxCoverMediaElCalls.length === 0);

// 2) bannerImage set -> real cover art via pflxCoverMediaEl
pflxCoverMediaElCalls = [];
let html2 = mcDashCardHtml({ icon: '\u{1F3C1}', title: 'Checkpoint Alpha', bannerImage: 'https://example.com/cp.png', accentRgb: '0,212,255' });
check('cover-art card: pflxCoverMediaEl called once', pflxCoverMediaElCalls.length === 1);
check('cover-art card: correct bannerImage passed through', pflxCoverMediaElCalls[0][1] === 'https://example.com/cp.png');
check('cover-art card: real 16:9 aspect-ratio markup present', html2.indexOf('aspect-ratio:16/9') !== -1);

// 3) embedUrl also triggers cover media path (video/slideshow support)
pflxCoverMediaElCalls = [];
let html3 = mcDashCardHtml({ icon: '\u{1F3AC}', title: 'Project X', embedUrl: 'https://youtube.com/embed/xyz', accentRgb: '167,139,250' });
check('embed card: pflxCoverMediaEl called with embedUrl', pflxCoverMediaElCalls.length === 1 && pflxCoverMediaElCalls[0][0] === 'https://youtube.com/embed/xyz');

// 4) XSS escaping on title / statusLabel
let html4 = mcDashCardHtml({ icon: '\u{1F4D0}', title: '<script>alert(1)</script>', statusLabel: '<b>ACTIVE</b>', statusColor: '#fff', accentRgb: '0,212,255' });
check('title is escaped (no raw <script>)', html4.indexOf('<script>alert(1)</script>') === -1 && html4.indexOf('&lt;script&gt;') !== -1);
check('statusLabel is escaped (no raw <b>)', html4.indexOf('<span class="mc-pill"') !== -1 && html4.indexOf('&lt;b&gt;ACTIVE&lt;/b&gt;') !== -1);

// 5) buttons/stats/metaLine pass through as real HTML (not escaped, since
// callers build them with escapeHtml themselves where needed)
let html5 = mcDashCardHtml({ icon: '\u{1F3C1}', title: 'CP', buttonsHtml: '<button onclick="mcEditCheckpoint(2)">Edit</button>', statsHtml: '<div>STATS</div>', metaLine: 'META', accentRgb: '0,212,255' });
check('buttonsHtml rendered verbatim', html5.indexOf('onclick="mcEditCheckpoint(2)"') !== -1);
check('statsHtml rendered verbatim', html5.indexOf('<div>STATS</div>') !== -1);
check('metaLine rendered', html5.indexOf('META') !== -1);

// 6) no statusLabel -> no pill rendered
let html6 = mcDashCardHtml({ icon: '\u{1F4D0}', title: 'No Status', accentRgb: '0,212,255' });
check('no statusLabel -> no mc-pill span', html6.indexOf('mc-pill') === -1);

// ── Structural / wiring checks on the real mcRenderDashboard source ──
const dashFn = extractFn(src, 'function mcRenderDashboard() {');
check('mcRenderDashboard extracted from real source', !!dashFn);

check('org banner: mounts into #mc-dash-org-banner', dashFn.indexOf("getElementById('mc-dash-org-banner')") !== -1);
check('org banner: calls the REAL ppHomeOrgCardHtml (not reimplemented)', dashFn.indexOf('ppHomeOrgCardHtml()') !== -1);
check('org banner: fails safe on error (try/catch)', /try\s*\{\s*orgBannerEl\.innerHTML[\s\S]*?catch/.test(dashFn));

check('Programs section: mounts into #mc-dash-programs', dashFn.indexOf("getElementById('mc-dash-programs')") !== -1);
check('Programs section: reads real mcPrograms array', dashFn.indexOf('mcPrograms') !== -1);
check('Programs section: reuses real _pflxProgramRollup (not reimplemented)', dashFn.indexOf('_pflxProgramRollup(pg)') !== -1);
check('Programs section: capped at 6 items', dashFn.indexOf('.slice(0, 6)') !== -1 && (dashFn.match(/\.slice\(0, 6\)/g) || []).length >= 3);
check('Programs section: Generate Checkpoints button wired to real fn', dashFn.indexOf('mcSeasonGenerateCheckpoints(') !== -1);
check('Programs section: Edit wired to real mcShowProgramTabForm', dashFn.indexOf('mcShowProgramTabForm(') !== -1);
check('Programs section: Delete wired to real mcSeasonDeleteProgram', dashFn.indexOf('mcSeasonDeleteProgram(') !== -1);

check('Checkpoints section: uses mcDashCardHtml (the big-card standard)', /cpEl\.innerHTML[\s\S]*?mcDashCardHtml\(/.test(dashFn));
check('Checkpoints section: Edit wired to real mcEditCheckpoint by index', dashFn.indexOf('mcEditCheckpoint(' + "' + cpIdx + '" + ')') !== -1 || dashFn.indexOf('mcEditCheckpoint(\' + cpIdx') !== -1);
check('Checkpoints section: Delete wired to real mcDeleteCheckpoint by index', dashFn.indexOf('mcDeleteCheckpoint(\' + cpIdx') !== -1);
check('Checkpoints section: still filters to active/upcoming (unchanged rule)', dashFn.indexOf("c.status === 'active' || c.status === 'upcoming'") !== -1);

check('Projects section: uses mcDashCardHtml (the big-card standard)', /projEl\.innerHTML[\s\S]*?mcDashCardHtml\(/.test(dashFn));
check('Projects section: Edit wired to real mcEditProject by index', dashFn.indexOf('mcEditProject(\' + projIdx') !== -1);
check('Projects section: Delete wired to real mcDeleteProject by index', dashFn.indexOf('mcDeleteProject(\' + projIdx') !== -1);
check('Projects section: still filters to in_progress/planning (unchanged rule)', dashFn.indexOf("p.status === 'in_progress' || p.status === 'planning'") !== -1);

// ── HTML markup checks (grid containers + org banner mount + Programs card) ──
check('HTML: #mc-dash-org-banner mount point exists', src.indexOf('id="mc-dash-org-banner"') !== -1);
check('HTML: #mc-dash-programs mount point exists', src.indexOf('id="mc-dash-programs"') !== -1);
check('HTML: checkpoints container is a real grid (not a flex column stack)', /id="mc-dash-checkpoints" style="display:grid/.test(src));
check('HTML: projects container is a real grid (not a flex column stack)', /id="mc-dash-projects" style="display:grid/.test(src));

// ── Version bump ──
check('PFLX_PATCH bumped to 204', src.indexOf('window.PFLX_PATCH   = 204;') !== -1);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
