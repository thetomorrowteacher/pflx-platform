#!/usr/bin/env node
// PATCH PLATFORM v183 (Ennis): (a)/(b) Voice section moved to render AFTER
// the mode-tabs bar (tab bar now consistent in every mode), (c) fixed the
// drag-hijack bug that broke the size-preset "top buttons", and added an
// explicit band-independent hide/show toggle for the tab bar itself
// ("I was refering to hiding the toolbar"). Extracts the REAL shipped
// code via brace/string matching -- never a reimplementation.
'use strict';
const fs = require('fs');

const path = process.argv[2];
if (!path) { console.error('usage: node test_xbot_dock_v183.js <preview.html>'); process.exit(1); }
const src = fs.readFileSync(path, 'utf-8');

let pass = 0, fail = 0;
function check(name, cond) {
    if (cond) { pass++; console.log('PASS: ' + name); }
    else { fail++; console.log('FAIL: ' + name); }
}

check('PFLX_PATCH bumped to 183', src.includes("window.PFLX_PATCH   = 183;"));

function extractBetween(source, startMarker, endMarker) {
    const startIdx = source.indexOf(startMarker);
    if (startIdx === -1) throw new Error('start marker not found: ' + startMarker);
    const endIdx = source.indexOf(endMarker, startIdx + startMarker.length);
    if (endIdx === -1) throw new Error('end marker not found: ' + endMarker);
    return source.slice(startIdx, endIdx + endMarker.length);
}

// ---------------------------------------------------------------------
// 1. (a)/(b) Tab-bar / Tap-to-talk ordering -- source-position checks.
// ---------------------------------------------------------------------
const idxModeTabsComment = src.indexOf('<!-- Mode Tabs -->');
const idxModeTabsOpen = src.indexOf('<div class="xbot-mode-tabs">', idxModeTabsComment);
const idxVoiceSectionComment = src.indexOf('<!-- Voice Chat Section');
const idxChatMessagesComment = src.indexOf('<!-- Chat Messages -->');
const idxHostBroadcastComment = src.indexOf('<!-- Host Broadcast Composer');
const idxCloseBtn = src.indexOf('id="xbot-close" title="Close Panel"');

check('exactly one Voice Chat Section comment/div exists', src.split('id="xbot-voice-section"').length - 1 === 1);
check('Voice Chat Section now sits AFTER the Mode Tabs opening div', idxVoiceSectionComment > idxModeTabsOpen && idxModeTabsOpen !== -1);
check('Voice Chat Section sits BEFORE the Chat Messages section (same slot every other mode section uses)', idxVoiceSectionComment < idxChatMessagesComment && idxChatMessagesComment !== -1);
check('the Host Broadcast composer immediately follows the panel header now (voice section no longer wedged between them)', (function () {
    const between = src.slice(idxCloseBtn, idxHostBroadcastComment);
    return idxCloseBtn !== -1 && idxHostBroadcastComment !== -1 && !between.includes('xbot-voice-section');
})());

// ---------------------------------------------------------------------
// 2. (c) "top buttons" -- the makeDrag() exclusion fix.
// ---------------------------------------------------------------------
const dragLine = extractBetween(
    src,
    "if (e.target && (e.target.classList.contains('pflx-dock-tab')",
    "return;"
);
check('makeDrag exclusion now also checks .pflx-dock-size-btn', dragLine.includes("e.target.classList.contains('pflx-dock-size-btn')"));
check('makeDrag exclusion still checks .pflx-dock-tab (unchanged)', dragLine.includes("e.target.classList.contains('pflx-dock-tab')"));
check('makeDrag exclusion still checks .pflx-dock-hbtn (unchanged)', dragLine.includes("e.target.classList.contains('pflx-dock-hbtn')"));
check('makeDrag exclusion still checks .pflx-dock-rsz (unchanged)', dragLine.includes("pflx-dock-rsz"));

// Behavioral: run the REAL extracted condition against fake targets to
// prove a size-preset button now bails out of the drag gesture.
(function () {
    function fakeTarget(classes) {
        return { classList: { contains: function (c) { return classes.indexOf(c) !== -1; } }, className: classes.join(' ') };
    }
    const body = dragLine.replace('return;', 'return true;') + ' return false;';
    const factory = new Function('e', body);
    check('real condition: a .pflx-dock-size-btn target is excluded (drag does NOT start)', factory({ target: fakeTarget(['pflx-dock-size-btn']) }) === true);
    check('real condition: a .pflx-dock-tab target is still excluded (unchanged)', factory({ target: fakeTarget(['pflx-dock-tab', 'active']) }) === true);
    check('real condition: a .pflx-dock-hbtn target is still excluded (unchanged)', factory({ target: fakeTarget(['pflx-dock-hbtn']) }) === true);
    check('real condition: a plain header target (no special class) is NOT excluded (drag still works on the header itself)', factory({ target: fakeTarget([]) }) === false);
})();

// ---------------------------------------------------------------------
// 3. New "hide the toolbar" toggle -- markup + CSS + state plumbing.
// ---------------------------------------------------------------------
check('.xbot-mode-tabs.xbot-tabs-hidden CSS rule added', src.includes('.xbot-mode-tabs.xbot-tabs-hidden {'));
check('#pflx-dock-tabs-toggle button added to the dock header', src.includes('id="pflx-dock-tabs-toggle"') && src.includes('class="pflx-dock-hbtn" id="pflx-dock-tabs-toggle"'));
check('TABSHIDEK persistence key added', src.includes("TABSHIDEK = 'pflx_dock_tabshidden'"));
check('dock state object gained tabsHidden field', src.includes("var state = { x: 0, y: 0, w: 420, h: 560, open: false, tab: 'xbot', autoSpeak: false, tabsHidden: false };"));

// Behavioral: build the real persist()/restore() functions in a sandbox
// with a fake localStorage and confirm tabsHidden round-trips correctly,
// including the safe default (never stored yet -> false).
(function () {
    const persistBlock = extractBetween(src, 'function persist() {', '}\n        // v172 -- X-Bot Controller foundation');
    // Slice off the trailing comment marker we used only to anchor the end.
    const persistRestoreSrc = persistBlock.slice(0, persistBlock.lastIndexOf('\n        // v172'));

    function makeFakeLocalStorage(initial) {
        const store = Object.assign({}, initial || {});
        return {
            setItem: function (k, v) { store[k] = String(v); },
            getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
            _store: store
        };
    }

    const RECTK = 'pflx_dock_rect', ICONK = 'pflx_dock_icon', TABK = 'pflx_dock_tab', SPEAKK = 'pflx_dock_autospeak', TABSHIDEK = 'pflx_dock_tabshidden';

    function run(state, icon, fakeLS) {
        const factory = new Function('localStorage', 'RECTK', 'ICONK', 'TABK', 'SPEAKK', 'TABSHIDEK', 'state', 'icon',
            persistRestoreSrc + '\nreturn { persist: persist, restore: restore };');
        return factory(fakeLS, RECTK, ICONK, TABK, SPEAKK, TABSHIDEK, state, icon);
    }

    // Round-trip: tabsHidden = true persists and restores as true.
    const ls1 = makeFakeLocalStorage();
    const state1 = { x: 1, y: 2, w: 400, h: 500, tab: 'xbot', autoSpeak: false, tabsHidden: true };
    const api1 = run(state1, { x: 0, y: 0 }, ls1);
    api1.persist();
    check('persist(): writes tabsHidden=1 to localStorage when true', ls1._store[TABSHIDEK] === '1');
    const state1b = { tabsHidden: false };
    const api1b = run(state1b, { x: 0, y: 0 }, ls1);
    api1b.restore();
    check('restore(): reads tabsHidden back as true from a fresh state object', state1b.tabsHidden === true);

    // Round-trip: tabsHidden = false persists and restores as false.
    const ls2 = makeFakeLocalStorage();
    const state2 = { x: 1, y: 2, w: 400, h: 500, tab: 'xbot', autoSpeak: false, tabsHidden: false };
    const api2 = run(state2, { x: 0, y: 0 }, ls2);
    api2.persist();
    check('persist(): writes tabsHidden=0 to localStorage when false', ls2._store[TABSHIDEK] === '0');
    const state2b = { tabsHidden: true };
    const api2b = run(state2b, { x: 0, y: 0 }, ls2);
    api2b.restore();
    check('restore(): reads tabsHidden back as false', state2b.tabsHidden === false);

    // Never-stored default: restore() on an empty store must not throw and
    // must leave tabsHidden false (safe default), matching the file's own
    // "=== '1'" pattern used for autoSpeak.
    const ls3 = makeFakeLocalStorage();
    const state3 = { tabsHidden: true }; // deliberately wrong initial value
    let threw = false;
    try { run(state3, { x: 0, y: 0 }, ls3).restore(); } catch (e) { threw = true; }
    check('restore(): never-stored tabsHidden -> safe default false, never throws', !threw && state3.tabsHidden === false);
})();

// Behavioral: the click-wiring block (mode-tabs peek/un-hide + the new
// toggle button + the pre-existing minimize wiring, unchanged) -- extract
// and run against fake DOM elements to prove real event behavior.
(function () {
    const wireBlock = extractBetween(
        src,
        "(function () {\n                var modeTabsBar = document.querySelector('.xbot-mode-tabs');",
        "document.getElementById('pflx-dock-min').addEventListener('click', closeDock);"
    );

    function makeFakeElement() {
        const listeners = {};
        const classes = new Set();
        return {
            addEventListener: function (type, fn) { listeners[type] = fn; },
            _fire: function (type, ev) { if (listeners[type]) listeners[type](ev); },
            classList: {
                add: function (c) { classes.add(c); },
                remove: function (c) { classes.delete(c); },
                contains: function (c) { return classes.has(c); }
            },
            _classes: classes
        };
    }
    function makeFakeEvent() {
        let prevented = false, stopped = false;
        return { preventDefault: function () { prevented = true; }, stopPropagation: function () { stopped = true; }, _prevented: function () { return prevented; }, _stopped: function () { return stopped; } };
    }

    (function () {
        const modeTabsBar = makeFakeElement();
        const tabsToggleBtn = makeFakeElement();
        const minBtn = makeFakeElement();
        const fakeDocument = {
            querySelector: function (sel) { return sel === '.xbot-mode-tabs' ? modeTabsBar : null; },
            getElementById: function (id) {
                if (id === 'pflx-dock-tabs-toggle') return tabsToggleBtn;
                if (id === 'pflx-dock-min') return minBtn;
                return null;
            }
        };
        let renderCalls = 0, persistCalls = 0;
        const state = { tabsHidden: false };
        const closeDock = function () {};
        const factory = new Function('document', 'state', 'render', 'persist', 'closeDock', wireBlock);
        factory(fakeDocument, state, function () { renderCalls++; }, function () { persistCalls++; }, closeDock);

        // Clicking the tabs-toggle button flips tabsHidden and re-renders/persists.
        tabsToggleBtn._fire('click', makeFakeEvent());
        check('clicking #pflx-dock-tabs-toggle turns tabsHidden ON', state.tabsHidden === true);
        check('clicking #pflx-dock-tabs-toggle calls render()', renderCalls === 1);
        check('clicking #pflx-dock-tabs-toggle calls persist()', persistCalls === 1);
        tabsToggleBtn._fire('click', makeFakeEvent());
        check('clicking #pflx-dock-tabs-toggle again turns tabsHidden back OFF', state.tabsHidden === false);

        // While explicitly hidden, clicking the sliver itself turns hiding
        // off entirely (not just a temporary peek).
        state.tabsHidden = true;
        const ev = makeFakeEvent();
        modeTabsBar._fire('click', ev);
        check('clicking the hidden tab-bar sliver un-hides it (tabsHidden -> false)', state.tabsHidden === false);
        check('clicking the hidden sliver does NOT also add the xbot-tabs-peek class', !modeTabsBar._classes.has('xbot-tabs-peek'));
        check('clicking the hidden sliver calls preventDefault/stopPropagation', ev._prevented() && ev._stopped());

        // Normal (not explicitly hidden) peek behavior is unchanged.
        const state2 = { tabsHidden: false };
        const modeTabsBar2 = makeFakeElement();
        const tabsToggleBtn2 = makeFakeElement();
        const minBtn2 = makeFakeElement();
        const fakeDocument2 = {
            querySelector: function (sel) { return sel === '.xbot-mode-tabs' ? modeTabsBar2 : null; },
            getElementById: function (id) { return id === 'pflx-dock-tabs-toggle' ? tabsToggleBtn2 : (id === 'pflx-dock-min' ? minBtn2 : null); }
        };
        const factory2 = new Function('document', 'state', 'render', 'persist', 'closeDock', wireBlock);
        factory2(fakeDocument2, state2, function () {}, function () {}, function () {});
        modeTabsBar2._fire('click', makeFakeEvent());
        check('normal peek behavior unchanged: a click with tabsHidden=false still adds xbot-tabs-peek', modeTabsBar2._classes.has('xbot-tabs-peek'));

        // The pre-existing minimize button wiring is untouched.
        let closedCalled = false;
        const factory3 = new Function('document', 'state', 'render', 'persist', 'closeDock', wireBlock);
        const modeTabsBar3 = makeFakeElement(), tabsToggleBtn3 = makeFakeElement(), minBtn3 = makeFakeElement();
        const fakeDocument3 = {
            querySelector: function (sel) { return sel === '.xbot-mode-tabs' ? modeTabsBar3 : null; },
            getElementById: function (id) { return id === 'pflx-dock-tabs-toggle' ? tabsToggleBtn3 : (id === 'pflx-dock-min' ? minBtn3 : null); }
        };
        factory3(fakeDocument3, { tabsHidden: false }, function () {}, function () {}, function () { closedCalled = true; });
        minBtn3._fire('click', {});
        check('the pre-existing #pflx-dock-min -> closeDock wiring is unchanged', closedCalled === true);
    })();
})();

console.log('');
console.log((pass + fail) + ' tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
