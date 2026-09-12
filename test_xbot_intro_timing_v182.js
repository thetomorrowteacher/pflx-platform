#!/usr/bin/env node
// PATCH PLATFORM v182 (Ennis): X-Bot's auto-open + daily briefing check
// must fire AFTER the PFLX Motion Graphic intro video finishes, not
// before/during it. Extracts the REAL shipped code via brace/string
// matching -- never a reimplementation.
'use strict';
const fs = require('fs');

const path = process.argv[2];
if (!path) { console.error('usage: node test_xbot_intro_timing_v182.js <preview.html>'); process.exit(1); }
const src = fs.readFileSync(path, 'utf-8');

let pass = 0, fail = 0;
function check(name, cond) {
    if (cond) { pass++; console.log('PASS: ' + name); }
    else { fail++; console.log('FAIL: ' + name); }
}

check('PFLX_PATCH bumped to 182', src.includes("window.PFLX_PATCH   = 182;"));

// ---------------------------------------------------------------------
// 1. Source-order checks -- confirm the auto-open/briefing calls no
//    longer sit before playMotionIntro(), and now sit after
//    navigateTo('home') inside its .then().
// ---------------------------------------------------------------------
const idxInitPlatform = src.indexOf("initPlatform(displayName);");
const idxPlayMotionIntroCall = src.indexOf("playMotionIntro().then(() => {");
const idxNavigateHome = src.indexOf("navigateTo('home');", idxPlayMotionIntroCall);
const idxAutoOpenIIFE = src.indexOf("(function pflxXBotAutoOpenOnLogin() {");
const idxBriefingCheck = src.indexOf("if (typeof window.pflxXBotDailyBriefingCheck === 'function') window.pflxXBotDailyBriefingCheck();");
const idxTutorialCheck = src.indexOf("if (typeof pflxTutCheckFirstLogin === 'function') {");

check('initPlatform() runs before playMotionIntro() is called', idxInitPlatform !== -1 && idxInitPlatform < idxPlayMotionIntroCall);
check('exactly one pflxXBotAutoOpenOnLogin IIFE exists in the file', src.split("(function pflxXBotAutoOpenOnLogin() {").length - 1 === 1);
check('exactly one daily-briefing-check call exists in the file', src.split("if (typeof window.pflxXBotDailyBriefingCheck === 'function') window.pflxXBotDailyBriefingCheck();").length - 1 === 1);
check('the auto-open IIFE now sits AFTER playMotionIntro() is called (not before)', idxAutoOpenIIFE > idxPlayMotionIntroCall);
check("the auto-open IIFE sits AFTER navigateTo('home') inside the .then()", idxAutoOpenIIFE > idxNavigateHome && idxNavigateHome !== -1);
check('the daily-briefing check also sits AFTER playMotionIntro() is called', idxBriefingCheck > idxPlayMotionIntroCall);
check('the daily-briefing check sits AFTER the auto-open IIFE (same relative order as before)', idxBriefingCheck > idxAutoOpenIIFE);
check('the first-login tutorial check still runs after both moved calls', idxTutorialCheck > idxBriefingCheck);

// ---------------------------------------------------------------------
// 2. Extract the .then() callback body and execute it in a sandbox to
//    prove the REAL call order at runtime, not just string position.
// ---------------------------------------------------------------------
function extractBetween(source, startMarker, endMarker) {
    const startIdx = source.indexOf(startMarker);
    if (startIdx === -1) throw new Error('start marker not found: ' + startMarker);
    const endIdx = source.indexOf(endMarker, startIdx + startMarker.length);
    if (endIdx === -1) throw new Error('end marker not found: ' + endMarker);
    return source.slice(startIdx, endIdx + endMarker.length);
}

const thenStart = "playMotionIntro().then(() => {";
const thenEnd = "                });";
const thenBlock = extractBetween(src, thenStart, thenEnd);

check('extracted .then() callback contains all 3 real calls in source', (
    thenBlock.includes("navigateTo('home')") &&
    thenBlock.includes('pflxXBotAutoOpenOnLogin') &&
    thenBlock.includes('pflxXBotDailyBriefingCheck') &&
    thenBlock.includes('pflxTutCheckFirstLogin')
));

(function () {
    const calls = [];
    const fakeWindow = {
        pflxDock: { open: function (tab) { calls.push('dock.open:' + tab); } },
        pflxXBotDailyBriefingCheck: function () { calls.push('dailyBriefingCheck'); }
    };
    const fakeNavigateTo = function (view) { calls.push('navigateTo:' + view); };
    const fakePflxTutCheckFirstLogin = function () { calls.push('tutCheckFirstLogin'); };
    const fakeSetTimeout = function (fn) { fn(); }; // execute immediately, synchronously, for ordering purposes

    // Build a runnable ".then(() => { ... })" callback body by wrapping
    // the extracted real code in an arrow function and invoking it.
    const bodyStart = thenBlock.indexOf('{') + 1;
    const bodyEnd = thenBlock.lastIndexOf('}');
    const body = thenBlock.slice(bodyStart, bodyEnd);

    const factory = new Function(
        'window', 'navigateTo', 'setTimeout', 'pflxTutCheckFirstLogin',
        body
    );
    factory(fakeWindow, fakeNavigateTo, fakeSetTimeout, fakePflxTutCheckFirstLogin);

    check('runtime order: navigateTo runs first', calls[0] === "navigateTo:home");
    check('runtime order: dock.open (auto-open) runs after navigateTo', calls.indexOf('dock.open:xbot') > calls.indexOf('navigateTo:home'));
    check('runtime order: daily briefing check runs after dock.open', calls.indexOf('dailyBriefingCheck') > calls.indexOf('dock.open:xbot'));
    check('runtime order: tutorial check runs last', calls.indexOf('tutCheckFirstLogin') === calls.length - 1);
})();

(function () {
    // Safe no-op when window.pflxDock is missing entirely (never throws).
    const calls = [];
    const fakeWindow = {}; // no pflxDock, no pflxXBotDailyBriefingCheck
    const fakeNavigateTo = function (view) { calls.push('navigateTo:' + view); };
    const fakePflxTutCheckFirstLogin = function () { calls.push('tutCheckFirstLogin'); };
    const fakeSetTimeout = function (fn) { fn(); };

    const bodyStart = thenBlock.indexOf('{') + 1;
    const bodyEnd = thenBlock.lastIndexOf('}');
    const body = thenBlock.slice(bodyStart, bodyEnd);
    const factory = new Function('window', 'navigateTo', 'setTimeout', 'pflxTutCheckFirstLogin', body);

    let threw = false;
    try { factory(fakeWindow, fakeNavigateTo, fakeSetTimeout, fakePflxTutCheckFirstLogin); }
    catch (e) { threw = true; }
    check('no pflxDock / no daily-briefing-check function -> safe no-op, never throws', !threw && calls[0] === 'navigateTo:home' && calls.indexOf('tutCheckFirstLogin') !== -1);
})();

console.log('');
console.log((pass + fail) + ' tests: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
