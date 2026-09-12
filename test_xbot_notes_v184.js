#!/usr/bin/env node
// PATCH PLATFORM v184 (Ennis): Notes panel simplified from v181's
// Supabase-backed autosave to plain localStorage -- no cloud round-trip,
// no new app_data row. Extracts the REAL shipped code via brace/string
// matching -- never a reimplementation.
'use strict';
const fs = require('fs');

const path = process.argv[2];
if (!path) { console.error('usage: node test_xbot_notes_v184.js <preview.html>'); process.exit(1); }
const src = fs.readFileSync(path, 'utf-8');

let pass = 0, fail = 0;
function check(name, cond) {
    if (cond) { pass++; console.log('PASS: ' + name); }
    else { fail++; console.log('FAIL: ' + name); }
}

check('PFLX_PATCH bumped to 184', src.includes("window.PFLX_PATCH   = 184;"));

function extractBetween(source, startMarker, endMarker) {
    const startIdx = source.indexOf(startMarker);
    if (startIdx === -1) throw new Error('start marker not found: ' + startMarker);
    const endIdx = source.indexOf(endMarker, startIdx + startMarker.length);
    if (endIdx === -1) throw new Error('end marker not found: ' + endMarker);
    return source.slice(startIdx, endIdx);
}

const block = extractBetween(
    src,
    'window.pflxXBotNotesLocalKey = function (session) {',
    '\n\n        // ══ PATCH PLATFORM v174 -- xc-3: Theater watch panel, ported from'
);

// ---------------------------------------------------------------------
// 1. Static checks: Supabase is genuinely gone from this block.
// ---------------------------------------------------------------------
check('block contains no Supabase client call', !block.includes('pflxSupabase'));
check('block contains no app_data table access', !block.includes("from('app_data')"));
check('block contains no upsert call', !block.includes('.upsert('));
check('block contains no async/await (no longer needed)', !block.includes('async ') && !block.includes('await '));
check('old cloud-key function name is gone', !src.includes('window.pflxXBotNotesCloudKey'));
check('new local-key function name is present', block.includes('window.pflxXBotNotesLocalKey'));
check('uses window.localStorage for persistence', block.includes('window.localStorage.getItem') && block.includes('window.localStorage.setItem'));

// ---------------------------------------------------------------------
// 2. Sandbox: build the real functions with a fake window/document/
//    localStorage and exercise real behavior.
// ---------------------------------------------------------------------
function makeSandbox(opts) {
    opts = opts || {};
    const store = Object.assign({}, opts.initialStore || {});
    const localStorageThrows = !!opts.localStorageThrows;
    const fakeLocalStorage = {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
        setItem: function (k, v) {
            if (localStorageThrows) throw new Error('quota exceeded');
            store[k] = v;
        }
    };
    const elements = {
        'xbot-notes-textarea': { value: '', disabled: false },
        'xbot-notes-status': { textContent: '' }
    };
    if (opts.noTextarea) delete elements['xbot-notes-textarea'];
    const fakeDocument = {
        getElementById: function (id) { return elements[id] || null; }
    };
    const timers = [];
    // Real browsers never return 0 from setTimeout -- ids start at 1. Match
    // that here so the shipped code's `if (xbotNotesSaveTimer)` truthiness
    // check (harmless in every real browser) isn't tripped by a fake id of 0.
    const fakeSetTimeout = function (fn, ms) { const id = timers.length + 1; timers.push({ fn: fn, ms: ms, cleared: false }); return id; };
    const fakeClearTimeout = function (id) { const t = timers[id - 1]; if (t) t.cleared = true; };
    const fakeWindow = {
        activeSession: opts.session,
        localStorage: fakeLocalStorage
    };
    const factory = new Function(
        'window', 'document', 'setTimeout', 'clearTimeout', 'console',
        block + '\nreturn { pflxXBotNotesLocalKey: window.pflxXBotNotesLocalKey, xbotNotesFormatSavedTime: window.xbotNotesFormatSavedTime, xbotNotesLoad: window.xbotNotesLoad, xbotNotesScheduleSave: window.xbotNotesScheduleSave, xbotNotesSaveNow: window.xbotNotesSaveNow };'
    );
    const api = factory(fakeWindow, fakeDocument, fakeSetTimeout, fakeClearTimeout, console);
    return { api: api, store: store, elements: elements, timers: timers, window: fakeWindow };
}

// pflxXBotNotesLocalKey
(function () {
    const sb = makeSandbox({ session: null });
    check('pflxXBotNotesLocalKey(null) -> null', sb.api.pflxXBotNotesLocalKey(null) === null);
    check('pflxXBotNotesLocalKey({}) -> null (no id)', sb.api.pflxXBotNotesLocalKey({}) === null);
    check('pflxXBotNotesLocalKey({id:"abc"}) -> pflx_xbot_notes_abc', sb.api.pflxXBotNotesLocalKey({ id: 'abc' }) === 'pflx_xbot_notes_abc');
})();

// xbotNotesFormatSavedTime
(function () {
    const sb = makeSandbox({ session: null });
    check('formatSavedTime noon -> 12:00 PM', sb.api.xbotNotesFormatSavedTime(new Date(2026, 0, 1, 12, 0)) === 'Saved 12:00 PM');
    check('formatSavedTime midnight -> 12:00 AM', sb.api.xbotNotesFormatSavedTime(new Date(2026, 0, 1, 0, 0)) === 'Saved 12:00 AM');
    check('formatSavedTime single-digit minute pads', sb.api.xbotNotesFormatSavedTime(new Date(2026, 0, 1, 9, 5)) === 'Saved 9:05 AM');
    check('formatSavedTime afternoon', sb.api.xbotNotesFormatSavedTime(new Date(2026, 0, 1, 15, 30)) === 'Saved 3:30 PM');
});

// xbotNotesLoad
(function () {
    const sb = makeSandbox({ noTextarea: true, session: { id: 's1' } });
    let threw = false;
    try { sb.api.xbotNotesLoad(); } catch (e) { threw = true; }
    check('xbotNotesLoad: no textarea -> safe no-op, never throws', !threw);
})();

(function () {
    const sb = makeSandbox({ session: null });
    sb.api.xbotNotesLoad();
    check('xbotNotesLoad: no session -> textarea disabled', sb.elements['xbot-notes-textarea'].disabled === true);
    check('xbotNotesLoad: no session -> textarea cleared', sb.elements['xbot-notes-textarea'].value === '');
    check('xbotNotesLoad: no session -> status says log in', sb.elements['xbot-notes-status'].textContent === 'Log in to keep notes.');
})();

(function () {
    const sb = makeSandbox({ session: { id: 's1' }, initialStore: { pflx_xbot_notes_s1: 'hello world' } });
    sb.api.xbotNotesLoad();
    check('xbotNotesLoad: with session + stored text -> loads text', sb.elements['xbot-notes-textarea'].value === 'hello world');
    check('xbotNotesLoad: with session + stored text -> textarea enabled', sb.elements['xbot-notes-textarea'].disabled === false);
    check('xbotNotesLoad: with session + stored text -> status shows saved time', /^Saved \d/.test(sb.elements['xbot-notes-status'].textContent));
})();

(function () {
    const sb = makeSandbox({ session: { id: 's2' } }); // no stored value
    sb.api.xbotNotesLoad();
    check('xbotNotesLoad: with session, no stored text -> value empty', sb.elements['xbot-notes-textarea'].value === '');
    check('xbotNotesLoad: with session, no stored text -> status empty', sb.elements['xbot-notes-status'].textContent === '');
})();

(function () {
    const sb = makeSandbox({ session: { id: 's3' }, initialStore: { pflx_xbot_notes_s3: 'first load' } });
    sb.api.xbotNotesLoad();
    // Simulate the user typing something new without saving yet.
    sb.elements['xbot-notes-textarea'].value = 'in progress typing...';
    sb.api.xbotNotesLoad(); // reopening the SAME session's tab
    check('xbotNotesLoad: reopening same session key does not clobber in-progress typing', sb.elements['xbot-notes-textarea'].value === 'in progress typing...');
})();

// xbotNotesScheduleSave / xbotNotesSaveNow
(function () {
    const sb = makeSandbox({ session: { id: 's4' } });
    sb.elements['xbot-notes-textarea'].value = 'typed content';
    sb.api.xbotNotesScheduleSave();
    check('xbotNotesScheduleSave: sets status to Typing…', sb.elements['xbot-notes-status'].textContent === 'Typing…');
    check('xbotNotesScheduleSave: schedules exactly one timer', sb.timers.filter(function (t) { return !t.cleared; }).length === 1);
    check('xbotNotesScheduleSave: debounce delay is 900ms', sb.timers[0].ms === 900);
    // Fire the scheduled save manually (simulating the timer elapsing).
    sb.timers[0].fn();
    check('xbotNotesScheduleSave -> saveNow: value persisted to localStorage', sb.store['pflx_xbot_notes_s4'] === 'typed content');
    check('xbotNotesScheduleSave -> saveNow: status shows saved time', /^Saved \d/.test(sb.elements['xbot-notes-status'].textContent));
})();

(function () {
    const sb = makeSandbox({ session: { id: 's5' } });
    sb.api.xbotNotesScheduleSave();
    sb.api.xbotNotesScheduleSave();
    sb.api.xbotNotesScheduleSave();
    const uncleared = sb.timers.filter(function (t) { return !t.cleared; });
    check('xbotNotesScheduleSave: rapid re-typing clears prior timers, leaving exactly one pending', uncleared.length === 1);
})();

(function () {
    const sb = makeSandbox({ session: null });
    sb.elements['xbot-notes-textarea'].value = 'should not save';
    let threw = false;
    try { sb.api.xbotNotesSaveNow(); } catch (e) { threw = true; }
    check('xbotNotesSaveNow: no session -> safe no-op, never throws', !threw);
    check('xbotNotesSaveNow: no session -> nothing written to storage', Object.keys(sb.store).length === 0);
})();

(function () {
    const sb = makeSandbox({ noTextarea: true, session: { id: 's6' } });
    let threw = false;
    try { sb.api.xbotNotesSaveNow(); } catch (e) { threw = true; }
    check('xbotNotesSaveNow: no textarea -> safe no-op, never throws', !threw);
})();

(function () {
    const sb = makeSandbox({ session: { id: 's7' }, localStorageThrows: true });
    sb.elements['xbot-notes-textarea'].value = 'will fail to save';
    let threw = false;
    try { sb.api.xbotNotesSaveNow(); } catch (e) { threw = true; }
    check('xbotNotesSaveNow: localStorage throws -> caught, never propagates', !threw);
    check('xbotNotesSaveNow: localStorage throws -> honest error status shown', sb.elements['xbot-notes-status'].textContent === 'Not saved (storage full or blocked)');
})();

console.log('');
console.log((pass + fail) + ' tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
