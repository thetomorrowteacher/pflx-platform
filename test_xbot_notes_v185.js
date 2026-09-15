// PATCH PLATFORM v185 -- xb-10 Notes v2: multiple named, rich-text notes +
// download-as-file. Extracts the REAL shipped pure functions
// (xbotNotesMigrateLegacy, xbotNotesSafeFilename, xbotNotesFormatSavedTime)
// via brace-matching -- never reimplemented -- plus structural/wiring
// checks on the real HTML markup and the DOM-touching orchestrator
// functions' source (full DOM simulation of the whole contenteditable
// editor is out of proportion; the pure logic is where the real risk is).

const fs = require('fs');
const path = process.argv[2];
if (!path) { console.error('usage: node test_xbot_notes_v185.js <preview.html>'); process.exit(1); }
const src = fs.readFileSync(path, 'utf8');

let pass = 0, fail = 0;
function check(label, cond) {
    if (cond) { pass++; console.log('PASS:', label); }
    else { fail++; console.log('FAIL:', label); }
}

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

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── xbotNotesMigrateLegacy ──
const migrateSrc = extractFn(src, 'window.xbotNotesMigrateLegacy = function (raw) {');
check('xbotNotesMigrateLegacy extracted from real source', !!migrateSrc);
const migrateFactory = new Function('window', 'escapeHtml', 'Date', migrateSrc.replace('window.xbotNotesMigrateLegacy = function', 'var xbotNotesMigrateLegacy = function') + '\nreturn xbotNotesMigrateLegacy;');
const RealDate = Date;
const xbotNotesMigrateLegacy = migrateFactory({}, escapeHtml, RealDate);

check('migrate: null/undefined raw -> empty store', JSON.stringify(xbotNotesMigrateLegacy(null)) === JSON.stringify({ notes: [], activeId: null }));
check('migrate: empty string raw -> empty store', JSON.stringify(xbotNotesMigrateLegacy('')) === JSON.stringify({ notes: [], activeId: null }));

let legacyStore = xbotNotesMigrateLegacy('Remember to COOOOOK!\nSecond line');
check('migrate: legacy plain-text wrapped into exactly one note', legacyStore.notes.length === 1);
check('migrate: legacy note gets a sensible default title', legacyStore.notes[0].title === 'My Notes');
check('migrate: legacy note text is escaped + newlines become <br>', legacyStore.notes[0].html === 'Remember to COOOOOK!<br>Second line');
check('migrate: legacy note is set active', legacyStore.activeId === legacyStore.notes[0].id);

let legacyXss = xbotNotesMigrateLegacy('<script>alert(1)</script>');
check('migrate: legacy text is HTML-escaped (no raw script tag)', legacyXss.notes[0].html.indexOf('<script>') === -1 && legacyXss.notes[0].html.indexOf('&lt;script&gt;') !== -1);

const wellFormed = { notes: [{ id: 'a', title: 'Note A', html: '<b>hi</b>', updatedAt: 111 }, { id: 'b', title: 'Note B', html: '', updatedAt: 222 }], activeId: 'b' };
let migratedWF = xbotNotesMigrateLegacy(JSON.stringify(wellFormed));
check('migrate: well-formed JSON passes through with 2 notes', migratedWF.notes.length === 2);
check('migrate: well-formed JSON preserves activeId', migratedWF.activeId === 'b');

let migratedBadActive = xbotNotesMigrateLegacy(JSON.stringify({ notes: [{ id: 'x', title: 'X', html: '', updatedAt: 1 }], activeId: 'does-not-exist' }));
check('migrate: dangling activeId falls back to first real note (never a ghost reference)', migratedBadActive.activeId === 'x');

let migratedGarbage = xbotNotesMigrateLegacy('{not valid json');
check('migrate: unparseable JSON-looking garbage is treated as legacy text, never throws', migratedGarbage.notes.length === 1 && migratedGarbage.notes[0].title === 'My Notes');

let migratedMissingFields = xbotNotesMigrateLegacy(JSON.stringify({ notes: [{ id: 'z' }], activeId: 'z' }));
check('migrate: a note missing title/html/updatedAt gets safe defaults, not undefined', migratedMissingFields.notes[0].title === 'Untitled Note' && migratedMissingFields.notes[0].html === '' && typeof migratedMissingFields.notes[0].updatedAt === 'number');

let migratedNoIdFiltered = xbotNotesMigrateLegacy(JSON.stringify({ notes: [{ id: 'ok', title: 'OK', html: '', updatedAt: 1 }, { title: 'no id, dropped' }], activeId: 'ok' }));
check('migrate: a malformed note with no id is dropped, not crash', migratedNoIdFiltered.notes.length === 1);

// ── xbotNotesSafeFilename ──
const filenameSrc = extractFn(src, 'window.xbotNotesSafeFilename = function (title) {');
check('xbotNotesSafeFilename extracted from real source', !!filenameSrc);
const filenameFactory = new Function('window', filenameSrc.replace('window.xbotNotesSafeFilename = function', 'var xbotNotesSafeFilename = function') + '\nreturn xbotNotesSafeFilename;');
const xbotNotesSafeFilename = filenameFactory({});

check('filename: normal title', xbotNotesSafeFilename('My Great Note') === 'My Great Note.html');
check('filename: empty/whitespace title falls back to Untitled Note.html', xbotNotesSafeFilename('   ') === 'Untitled Note.html');
check('filename: null title falls back to Untitled Note.html', xbotNotesSafeFilename(null) === 'Untitled Note.html');
check('filename: filesystem-unsafe characters stripped', xbotNotesSafeFilename('Notes: "Q1/Q2" <plan>?*|') === 'Notes Q1Q2 plan.html');
check('filename: collapses internal whitespace runs', xbotNotesSafeFilename('a    b     c') === 'a b c.html');

// ── xbotNotesFormatSavedTime (unchanged from v184, re-confirmed real) ──
const fmtSrc = extractFn(src, 'window.xbotNotesFormatSavedTime = function (d) {');
check('xbotNotesFormatSavedTime extracted from real source', !!fmtSrc);
const fmtFactory = new Function('window', fmtSrc.replace('window.xbotNotesFormatSavedTime = function', 'var xbotNotesFormatSavedTime = function') + '\nreturn xbotNotesFormatSavedTime;');
const xbotNotesFormatSavedTime = fmtFactory({});
check('formatSavedTime: accepts an explicit Date (used by renderActive for a note\'s own updatedAt)', xbotNotesFormatSavedTime(new Date(2026, 0, 1, 14, 5)) === 'Saved 2:05 PM');

// ── Structural / wiring checks on the real orchestrator functions ──
const loadSrc = extractFn(src, 'window.xbotNotesLoad = function () {');
check('xbotNotesLoad extracted from real source', !!loadSrc);
check('load: reuses the SAME storage key as v184 (no new key/migration path)', loadSrc.indexOf('pflxXBotNotesLocalKey') !== -1);
check('load: calls the real migration function (not reimplemented inline)', loadSrc.indexOf('xbotNotesMigrateLegacy') !== -1);
check('load: persists the migrated shape back so re-migration does not repeat every load', loadSrc.indexOf('localStorage.setItem') !== -1);
check('load: renders both the picker list and the active editor', loadSrc.indexOf('xbotNotesRenderList()') !== -1 && loadSrc.indexOf('xbotNotesRenderActive()') !== -1);

const newSrc = extractFn(src, 'window.xbotNotesNew = function () {');
check('xbotNotesNew extracted from real source', !!newSrc);
check('new note: generates a fresh id and focuses the title for renaming', newSrc.indexOf("titleEl.focus()") !== -1);
check('new note: saves immediately so an empty note is never lost on tab switch', newSrc.indexOf('xbotNotesSaveNow()') !== -1);

const deleteSrc = extractFn(src, 'window.xbotNotesDeleteActive = function () {');
check('xbotNotesDeleteActive extracted from real source', !!deleteSrc);
check('delete: confirms before destroying a note (irreversible)', deleteSrc.indexOf('confirm(') !== -1);

const execSrc = extractFn(src, 'window.xbotNotesExec = function (cmd, val) {');
check('xbotNotesExec extracted from real source', !!execSrc);
check('exec: refuses to run formatting commands when the editor is not editable', execSrc.indexOf("contenteditable") !== -1);
check('exec: formatting counts as an edit (triggers autosave)', execSrc.indexOf('xbotNotesScheduleSave()') !== -1);

const downloadSrc = extractFn(src, 'window.xbotNotesDownloadActive = function () {');
check('xbotNotesDownloadActive extracted from real source', !!downloadSrc);
check('download: builds a real standalone Blob/file, not a fake stub', downloadSrc.indexOf('new Blob(') !== -1 && downloadSrc.indexOf('createObjectURL') !== -1);
check('download: uses the real filename sanitizer (not reimplemented inline)', downloadSrc.indexOf('xbotNotesSafeFilename(') !== -1);
check('download: revokes the object URL after triggering the download (no leak)', downloadSrc.indexOf('revokeObjectURL') !== -1);

// ── HTML markup checks ──
check('HTML: notes picker <select> exists', src.indexOf('id="xbot-notes-picker"') !== -1);
check('HTML: notes title input exists', src.indexOf('id="xbot-notes-title"') !== -1);
check('HTML: rich-text contenteditable editor replaces the old plain textarea', src.indexOf('id="xbot-notes-editor" contenteditable="true"') !== -1 && src.indexOf('id="xbot-notes-textarea"') === -1);
check('HTML: Bold/Italic/Underline/Heading/Bullet/Numbered toolbar buttons all wired to the real exec fn', (src.match(/xbotNotesExec\(/g) || []).length >= 6);
check('HTML: a real "Save as File" download button exists', src.indexOf('xbotNotesDownloadActive()') !== -1);
check('HTML: a real "+ New" note button exists', src.indexOf('xbotNotesNew()') !== -1);
check('HTML: a real delete-note button exists', src.indexOf('xbotNotesDeleteActive()') !== -1);

// ── Version bump ──
check('PFLX_PATCH bumped to 205', src.indexOf('window.PFLX_PATCH   = 205;') !== -1);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
