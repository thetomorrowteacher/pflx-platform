#!/usr/bin/env node
// PATCH PLATFORM v195 (Ennis, screenshot: "I need to be able to hide all
// of this in the X-Bot chat. This will allow for better viewing in
// smaller windows."): extends the v183 tabsHidden toggle so ONE click
// also collapses .xbot-panel-header (branding row) and
// #xbot-broadcast-composer (Host Broadcast row), not just the mode-tabs
// bar -- matching the full region Ennis circled. The always-visible
// outer #pflx-dock-header (drag bar / X-BOT-P2P CHAT switch / size
// presets / minimize / this very toggle) is deliberately left alone.
// Extracts the REAL shipped code via string-marker extraction -- never a
// reimplementation.
'use strict';
const fs = require('fs');

const path = process.argv[2];
if (!path) { console.error('usage: node test_xbot_chrome_hide_v195.js <preview.html>'); process.exit(1); }
const src = fs.readFileSync(path, 'utf-8');

let pass = 0, fail = 0;
function check(name, cond) {
    if (cond) { pass++; console.log('PASS: ' + name); }
    else { fail++; console.log('FAIL: ' + name); }
}

function extractBetween(source, startMarker, endMarker) {
    const startIdx = source.indexOf(startMarker);
    if (startIdx === -1) throw new Error('start marker not found: ' + startMarker);
    const endIdx = source.indexOf(endMarker, startIdx + startMarker.length);
    if (endIdx === -1) throw new Error('end marker not found: ' + endMarker);
    return source.slice(startIdx, endIdx + endMarker.length);
}

check('PFLX_PATCH bumped to 195', src.includes("window.PFLX_PATCH   = 195;"));

// ---------------------------------------------------------------------
// 1. Static: CSS + JS + markup wiring present, and scoped correctly.
// ---------------------------------------------------------------------
check('.pflx-chrome-hidden CSS rule collapses .xbot-panel-header', src.includes('#pflx-dock.pflx-chrome-hidden .xbot-panel-header,'));
check('.pflx-chrome-hidden CSS rule also collapses #xbot-broadcast-composer (same rule, same selector list)',
    (function () {
        const rule = extractBetween(src, '#pflx-dock.pflx-chrome-hidden .xbot-panel-header,', 'display: none !important;\n        }');
        return rule.includes('#pflx-dock.pflx-chrome-hidden #xbot-broadcast-composer');
    })());
check('the outer #pflx-dock-header itself is NOT targeted by the chrome-hidden rule (must stay reachable)',
    !src.includes('#pflx-dock.pflx-chrome-hidden #pflx-dock-header'));
check('render() now toggles pflx-chrome-hidden on the dock off the SAME state.tabsHidden flag',
    src.includes("dock.classList.toggle('pflx-chrome-hidden', state.tabsHidden);"));
check('the toggle button title now describes the wider scope (header, broadcast row & tabs)',
    src.includes('title="Hide/show X-Bot header, broadcast row &amp; tabs (more room in small windows)"'));
check('the existing .xbot-mode-tabs.xbot-tabs-hidden sliver rule is unchanged (still the discoverable way back in)',
    src.includes('.xbot-mode-tabs.xbot-tabs-hidden {\n            max-height: 7px !important;\n            opacity: 0.35 !important;\n            cursor: pointer;\n        }'));

// ---------------------------------------------------------------------
// 2. Behavioral: extract the REAL render() function and prove it
// actually flips the new class in lockstep with the mode-tabs class,
// off the same flag, without touching anything else about render()'s
// pre-existing behavior (band classes, open/closed state, etc).
// ---------------------------------------------------------------------
const renderSrc = extractBetween(src, 'function render() {\n            if (!dock) return;', '\n        }\n\n        function dockify(el) {');
// renderSrc currently ends right before "\n\n        function dockify" --
// strip that trailing marker fragment back down to the function's own
// closing brace.
const renderBody = renderSrc.slice(0, renderSrc.lastIndexOf('\n        }') + '\n        }'.length);
check('render() extraction includes the new pflx-chrome-hidden toggle line (sanity check on the marker itself)',
    renderBody.includes("dock.classList.toggle('pflx-chrome-hidden', state.tabsHidden);"));

function makeFakeClassList() {
    const classes = new Set();
    return {
        add: function (c) { classes.add(c); },
        remove: function (c) { classes.delete(c); },
        toggle: function (c, force) {
            const on = force === undefined ? !classes.has(c) : !!force;
            if (on) classes.add(c); else classes.delete(c);
            return on;
        },
        contains: function (c) { return classes.has(c); },
        _set: classes,
    };
}
function makeFakeEl() {
    return { style: {}, classList: makeFakeClassList(), querySelectorAll: function () { return []; } };
}

function runRender(tabsHidden) {
    const dock = makeFakeEl();
    const fab = makeFakeEl();
    const header = makeFakeEl();
    const autoBtn = makeFakeEl();
    const tabsToggleBtn = makeFakeEl();
    const modeTabsEl = makeFakeEl();
    const state = { x: 10, y: 10, w: 420, h: 560, open: true, tab: 'xbot', autoSpeak: false, tabsHidden: tabsHidden };
    const icon = { x: 0, y: 0 };
    const fakeDocument = {
        getElementById: function (id) {
            if (id === 'pflx-dock-auto') return autoBtn;
            if (id === 'pflx-dock-tabs-toggle') return tabsToggleBtn;
            return null;
        },
        querySelector: function (sel) { return sel === '.xbot-mode-tabs' ? modeTabsEl : null; },
    };
    const fakeWindow = { activeSession: { id: 'p1' } };
    // sizeBand / SIZE_BAND_ORDER are covered by their own dedicated test
    // (test_xbot_controller_v172.js) -- stubbed here as pure no-op-safe
    // values so this test stays focused on the chrome-hide behavior.
    const sizeBand = function () { return 'standard'; };
    const SIZE_BAND_ORDER = ['compact', 'standard', 'wide', 'studio'];
    const COFF = 40;
    let clampSizeCalls = 0, clampRectPosCalls = 0, clampIconCalls = 0;
    const clampSize = function () { clampSizeCalls++; };
    const clampRectPos = function () { clampRectPosCalls++; };
    const clampIcon = function () { clampIconCalls++; };

    const factory = new Function(
        'dock', 'fab', 'header', 'state', 'icon', 'document', 'window',
        'sizeBand', 'SIZE_BAND_ORDER', 'COFF', 'clampSize', 'clampRectPos', 'clampIcon',
        renderBody + '\nreturn render;'
    );
    const render = factory(dock, fab, header, state, icon, fakeDocument, fakeWindow, sizeBand, SIZE_BAND_ORDER, COFF, clampSize, clampRectPos, clampIcon);
    render();
    return { dock: dock, modeTabsEl: modeTabsEl, tabsToggleBtn: tabsToggleBtn };
}

{
    const r = runRender(true);
    check('render() with tabsHidden=true adds pflx-chrome-hidden to the dock', r.dock.classList.contains('pflx-chrome-hidden'));
    check('render() with tabsHidden=true ALSO adds xbot-tabs-hidden to the mode-tabs bar (same flag, both fire together)', r.modeTabsEl.classList.contains('xbot-tabs-hidden'));
    check('render() with tabsHidden=true marks the toggle button "on"', r.tabsToggleBtn.classList.contains('on'));
}
{
    const r = runRender(false);
    check('render() with tabsHidden=false does NOT add pflx-chrome-hidden', !r.dock.classList.contains('pflx-chrome-hidden'));
    check('render() with tabsHidden=false does NOT add xbot-tabs-hidden either (still in lockstep)', !r.modeTabsEl.classList.contains('xbot-tabs-hidden'));
    check('render() with tabsHidden=false does not mark the toggle button "on"', !r.tabsToggleBtn.classList.contains('on'));
}
{
    // Toggling back and forth must be idempotent/reversible, not a
    // one-way collapse.
    const dock = makeFakeEl();
    const fab = makeFakeEl();
    const header = makeFakeEl();
    const state = { x: 10, y: 10, w: 420, h: 560, open: true, tab: 'xbot', autoSpeak: false, tabsHidden: false };
    const icon = { x: 0, y: 0 };
    const modeTabsEl = makeFakeEl();
    const tabsToggleBtn = makeFakeEl();
    const autoBtn = makeFakeEl();
    const fakeDocument = {
        getElementById: function (id) { return id === 'pflx-dock-auto' ? autoBtn : (id === 'pflx-dock-tabs-toggle' ? tabsToggleBtn : null); },
        querySelector: function (sel) { return sel === '.xbot-mode-tabs' ? modeTabsEl : null; },
    };
    const factory = new Function(
        'dock', 'fab', 'header', 'state', 'icon', 'document', 'window',
        'sizeBand', 'SIZE_BAND_ORDER', 'COFF', 'clampSize', 'clampRectPos', 'clampIcon',
        renderBody + '\nreturn render;'
    );
    const render = factory(dock, fab, header, state, icon, fakeDocument, { activeSession: { id: 'p1' } },
        function () { return 'standard'; }, ['compact', 'standard', 'wide', 'studio'], 40,
        function () {}, function () {}, function () {});
    render();
    check('starts un-hidden', !dock.classList.contains('pflx-chrome-hidden'));
    state.tabsHidden = true; render();
    check('flips to hidden on re-render after the flag changes', dock.classList.contains('pflx-chrome-hidden'));
    state.tabsHidden = false; render();
    check('flips back to visible -- the collapse is reversible, not one-way', !dock.classList.contains('pflx-chrome-hidden'));
}

console.log('');
console.log((pass + fail) + ' tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
