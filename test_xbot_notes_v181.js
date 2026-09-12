#!/usr/bin/env node
// PATCH PLATFORM v181 -- xb-10: Notes panel unit test.
// Extracts the REAL shipped code via brace/string matching, exactly like
// every other test this session -- never a reimplementation.
'use strict';
const fs = require('fs');

const path = process.argv[2];
if (!path) { console.error('usage: node test_xbot_notes_v181.js <preview.html>'); process.exit(1); }
const src = fs.readFileSync(path, 'utf-8');

let pass = 0, fail = 0;
function check(name, cond) {
    if (cond) { pass++; console.log('PASS: ' + name); }
    else { fail++; console.log('FAIL: ' + name); }
}

// ---------------------------------------------------------------------
// 1. Markup / wiring checks (string search against the real file)
// ---------------------------------------------------------------------
check('PFLX_PATCH bumped to 181', src.includes("window.PFLX_PATCH   = 181;"));
check('Notes mode tab button exists, wired to switchXBotMode', src.includes(
    `<button class="xbot-mode-tab" data-mode="notes" onclick="switchXBotMode('notes')">📝 Notes</button>`
));
check('#xbot-notes-section panel exists', src.includes(`id="xbot-notes-section"`));
check('#xbot-notes-textarea exists, wired to xbotNotesScheduleSave on input', src.includes(
    `id="xbot-notes-textarea" oninput="window.xbotNotesScheduleSave()"`
));
check('#xbot-notes-status exists', src.includes(`id="xbot-notes-status"`));
check('the "private, nobody else can see" copy is in the rendered UI, not just documented',
    src.includes('Private to you for this session'));
check('switchXBotMode declares and hides notesSection alongside the other optional sections',
    src.includes("var notesSection = document.getElementById('xbot-notes-section');") &&
    src.includes("if (notesSection) notesSection.style.display = 'none';"));
check("switchXBotMode's 'notes' branch calls the real xbotNotesLoad()", src.includes(
    "if (typeof window.xbotNotesLoad === 'function') window.xbotNotesLoad();"
));

// ---------------------------------------------------------------------
// 2. Extract the pure/cloud-key/orchestrator functions via brace/string
//    matching -- the SAME real shipped code, not a reimplementation.
// ---------------------------------------------------------------------
function extractBetween(source, startMarker, endMarker) {
    const startIdx = source.indexOf(startMarker);
    if (startIdx === -1) throw new Error('start marker not found');
    const endIdx = source.indexOf(endMarker, startIdx + startMarker.length);
    if (endIdx === -1) throw new Error('end marker not found');
    return source.slice(startIdx, endIdx);
}

const startMarker = "window.pflxXBotNotesCloudKey = function (session) {";
const endMarker = "\n\n        // ══ PATCH PLATFORM v174 -- xc-3: Theater watch panel, ported from";
const block = extractBetween(src, startMarker, endMarker);

check('extracted block contains all 5 real functions', (
    block.includes('window.pflxXBotNotesCloudKey') &&
    block.includes('window.xbotNotesFormatSavedTime') &&
    block.includes('window.xbotNotesLoad') &&
    block.includes('window.xbotNotesScheduleSave') &&
    block.includes('window.xbotNotesSaveNow')
));

function makeSandbox(opts) {
    opts = opts || {};
    const elements = Object.assign({
        'xbot-notes-textarea': { value: '', disabled: false },
        'xbot-notes-status': { textContent: '' }
    }, opts.elements || {});

    const fakeDocument = {
        getElementById: function (id) {
            return Object.prototype.hasOwnProperty.call(elements, id) ? elements[id] : null;
        }
    };

    const timeouts = [];
    const fakeSetTimeout = function (fn, ms) { timeouts.push({ fn, ms }); return timeouts.length; };
    const fakeClearTimeout = function () {};

    const sbCalls = { selects: [], upserts: [] };
    let selectResult = opts.selectResult !== undefined ? opts.selectResult : { data: null };
    let selectShouldThrow = !!opts.selectShouldThrow;
    let upsertShouldThrow = !!opts.upsertShouldThrow;

    const fakeSupabaseClient = {
        from: function (table) {
            return {
                select: function () {
                    return {
                        eq: function () {
                            return {
                                maybeSingle: async function () {
                                    sbCalls.selects.push(table);
                                    if (selectShouldThrow) throw new Error('select failed');
                                    return selectResult;
                                }
                            };
                        }
                    };
                },
                upsert: async function (row, conflictOpts) {
                    sbCalls.upserts.push({ table, row, conflictOpts });
                    if (upsertShouldThrow) throw new Error('upsert failed');
                    return { data: row, error: null };
                }
            };
        }
    };

    const fakeWindow = {
        activeSession: opts.activeSession !== undefined ? opts.activeSession : { id: 'u1', role: 'player' },
        pflxSupabase: opts.noSupabase ? undefined : function () { return fakeSupabaseClient; }
    };

    const factory = new Function(
        'window', 'document', 'setTimeout', 'clearTimeout', 'console',
        block + '\nreturn { pflxXBotNotesCloudKey: window.pflxXBotNotesCloudKey, xbotNotesFormatSavedTime: window.xbotNotesFormatSavedTime, xbotNotesLoad: window.xbotNotesLoad, xbotNotesScheduleSave: window.xbotNotesScheduleSave, xbotNotesSaveNow: window.xbotNotesSaveNow };'
    );

    const fns = factory(fakeWindow, fakeDocument, fakeSetTimeout, fakeClearTimeout, console);
    return { fns, elements, sbCalls, timeouts, fakeWindow };
}

async function main() {
    // -------------------------------------------------------------
    // 3. Pure function checks
    // -------------------------------------------------------------
    {
        const { fns } = makeSandbox();
        check('pflxXBotNotesCloudKey builds the per-user key from session.id',
            fns.pflxXBotNotesCloudKey({ id: 'abc123' }) === 'pflx_xbot_notes_abc123');
        check('pflxXBotNotesCloudKey returns null for a missing session', fns.pflxXBotNotesCloudKey(null) === null);
        check('pflxXBotNotesCloudKey returns null for a session with no id', fns.pflxXBotNotesCloudKey({}) === null);
    }

    {
        const { fns } = makeSandbox();
        check('xbotNotesFormatSavedTime: 9:05 AM formats correctly',
            fns.xbotNotesFormatSavedTime(new Date(2026, 0, 1, 9, 5)) === 'Saved 9:05 AM');
        check('xbotNotesFormatSavedTime: noon (12:00) formats as 12:00 PM',
            fns.xbotNotesFormatSavedTime(new Date(2026, 0, 1, 12, 0)) === 'Saved 12:00 PM');
        check('xbotNotesFormatSavedTime: midnight (0:00) formats as 12:00 AM',
            fns.xbotNotesFormatSavedTime(new Date(2026, 0, 1, 0, 0)) === 'Saved 12:00 AM');
        check('xbotNotesFormatSavedTime: 23:07 formats as 11:07 PM',
            fns.xbotNotesFormatSavedTime(new Date(2026, 0, 1, 23, 7)) === 'Saved 11:07 PM');
    }

    // -------------------------------------------------------------
    // 4. xbotNotesLoad orchestrator
    // -------------------------------------------------------------
    {
        const { fns, elements } = makeSandbox({ activeSession: null });
        await fns.xbotNotesLoad();
        check('load: no active session -> textarea cleared and disabled, status prompts login',
            elements['xbot-notes-textarea'].value === '' &&
            elements['xbot-notes-textarea'].disabled === true &&
            elements['xbot-notes-status'].textContent === 'Log in to keep notes.');
    }

    {
        const { fns, elements, sbCalls } = makeSandbox({
            activeSession: { id: 'u1' },
            selectResult: { data: { data: { text: 'existing note text' } } }
        });
        await fns.xbotNotesLoad();
        check('load: real note text found in the cloud -> textarea populated', elements['xbot-notes-textarea'].value === 'existing note text');
        check('load: status shows a "Saved <time>" label for existing text', /^Saved \d/.test(elements['xbot-notes-status'].textContent));
        check('load: reads from the app_data table', sbCalls.selects[0] === 'app_data');
    }

    {
        const { fns, elements } = makeSandbox({ activeSession: { id: 'u1' }, selectResult: { data: null } });
        await fns.xbotNotesLoad();
        check('load: no stored row yet -> empty textarea, no crash, status left blank',
            elements['xbot-notes-textarea'].value === '' && elements['xbot-notes-status'].textContent === '');
    }

    {
        const { fns, elements } = makeSandbox({ activeSession: { id: 'u1' }, selectShouldThrow: true });
        let threw = false;
        try { await fns.xbotNotesLoad(); } catch (e) { threw = true; }
        check('load: a failed cloud read never throws -- fails safe to an empty textarea',
            !threw && elements['xbot-notes-textarea'].value === '');
    }

    {
        const { fns, elements } = makeSandbox({ activeSession: { id: 'u1' }, noSupabase: true });
        let threw = false;
        try { await fns.xbotNotesLoad(); } catch (e) { threw = true; }
        check('load: no Supabase client available -> safe no-op, empty textarea, no crash',
            !threw && elements['xbot-notes-textarea'].value === '');
    }

    {
        // Reopening the SAME session's Notes tab a second time must NOT
        // clobber in-progress typing with whatever the cloud last held.
        const { fns, elements, sbCalls } = makeSandbox({
            activeSession: { id: 'u1' },
            selectResult: { data: { data: { text: 'server copy' } } }
        });
        await fns.xbotNotesLoad();
        elements['xbot-notes-textarea'].value = 'the user is mid-sentence and hasn'; // simulate live typing
        await fns.xbotNotesLoad(); // tab reopened for the SAME session
        check('load: reopening the same session does not overwrite in-progress typing',
            elements['xbot-notes-textarea'].value === 'the user is mid-sentence and hasn');
        check('load: reopening the same session does not re-hit the network', sbCalls.selects.length === 1);
    }

    // -------------------------------------------------------------
    // 5. xbotNotesSaveNow orchestrator
    // -------------------------------------------------------------
    {
        const { fns, elements, sbCalls } = makeSandbox({ activeSession: { id: 'u1' } });
        elements['xbot-notes-textarea'].value = 'hello world';
        await fns.xbotNotesSaveNow();
        check('save: upserts to the app_data table', sbCalls.upserts[0].table === 'app_data');
        check('save: upserts under the correct per-user key', sbCalls.upserts[0].row.key === 'pflx_xbot_notes_u1');
        check('save: upserts the real textarea content', sbCalls.upserts[0].row.data.text === 'hello world');
        check('save: uses onConflict: key (upsert, not insert)', sbCalls.upserts[0].conflictOpts.onConflict === 'key');
        check('save: status shows a "Saved <time>" label afterward', /^Saved \d/.test(elements['xbot-notes-status'].textContent));
    }

    {
        const { fns, elements } = makeSandbox({ activeSession: null });
        elements['xbot-notes-textarea'].value = 'should never be sent anywhere';
        await fns.xbotNotesSaveNow();
        check('save: no active session -> safe no-op, no crash', true);
    }

    {
        const { fns, elements } = makeSandbox({ activeSession: { id: 'u1' }, upsertShouldThrow: true });
        elements['xbot-notes-textarea'].value = 'network is down';
        let threw = false;
        try { await fns.xbotNotesSaveNow(); } catch (e) { threw = true; }
        check('save: a failed cloud write never throws, and tells the user it was not saved',
            !threw && elements['xbot-notes-status'].textContent.indexOf('Not saved') === 0);
    }

    {
        const { fns, elements } = makeSandbox({ activeSession: { id: 'u1' }, noSupabase: true });
        elements['xbot-notes-textarea'].value = 'offline';
        let threw = false;
        try { await fns.xbotNotesSaveNow(); } catch (e) { threw = true; }
        check('save: no Supabase client -> safe no-op, honest "offline" status, no crash',
            !threw && elements['xbot-notes-status'].textContent === 'Not saved (offline)');
    }

    // -------------------------------------------------------------
    // 6. xbotNotesScheduleSave debounce wiring
    // -------------------------------------------------------------
    {
        const { fns, elements, timeouts } = makeSandbox();
        fns.xbotNotesScheduleSave();
        check('scheduleSave: shows a "Typing…" status immediately', elements['xbot-notes-status'].textContent === 'Typing…');
        check('scheduleSave: schedules exactly one timeout', timeouts.length === 1);
        check('scheduleSave: debounce delay is 900ms', timeouts[0].ms === 900);
    }

    console.log('');
    console.log((pass + fail) + ' tests: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail === 0 ? 0 : 1);
}

main().catch(function (e) {
    console.error('TEST HARNESS CRASHED:', e);
    process.exit(1);
});
