// Unit tests for PATCH PLATFORM v1.167: Cyber Timer v2 (fullscreen fit, +1 min,
// manual entry) + un-pin Host Broadcast (collapsible composer).
// Extracts the REAL shipped functions from preview.html via brace/string matching.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

function extractBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
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

function makeSandbox() {
  const sandbox = {};
  sandbox.window = sandbox;
  const body = extractBetween(
    src,
    'function pflxParseManualDuration(minutesStr, secondsStr) {',
    'window.pflxTimerFitFontSize = pflxTimerFitFontSize;\n'
  );
  const full = body +
    '\nsandbox.pflxParseManualDuration = pflxParseManualDuration;' +
    '\nsandbox.pflxTimerAddMinute = pflxTimerAddMinute;' +
    '\nsandbox.pflxTimerFitFontSize = pflxTimerFitFontSize;\n';
  new Function('sandbox', 'with (sandbox) {\n' + full + '\n}')(sandbox);
  return sandbox;
}

function makeBroadcastSandbox() {
  const sandbox = {};
  sandbox.window = sandbox;
  const body = extractBetween(
    src,
    'function pflxBroadcastNextCollapsedState(currentlyCollapsed, forceCollapsed) {',
    'window.pflxBroadcastCollapsedPref = pflxBroadcastCollapsedPref;\n'
  );
  const full = body +
    '\nsandbox.pflxBroadcastNextCollapsedState = pflxBroadcastNextCollapsedState;' +
    '\nsandbox.pflxBroadcastCollapsedPref = pflxBroadcastCollapsedPref;\n';
  new Function('sandbox', 'with (sandbox) {\n' + full + '\n}')(sandbox);
  return sandbox;
}

const sb = makeSandbox();
const bsb = makeBroadcastSandbox();

// ---- pflxParseManualDuration ----
{
  const r = sb.pflxParseManualDuration('5', '30');
  check('manual entry: 5m30s parses ok with correct total seconds', r.ok === true && r.totalSeconds === 330);
}
{
  const r = sb.pflxParseManualDuration('', '');
  check('manual entry: empty strings default to 0 -> zero_duration error (not a crash)', r.ok === false && r.error === 'zero_duration');
}
{
  const r = sb.pflxParseManualDuration('0', '0');
  check('manual entry: explicit 0:00 is rejected as zero_duration', r.ok === false && r.error === 'zero_duration');
}
{
  const r = sb.pflxParseManualDuration('-1', '0');
  check('manual entry: negative minutes rejected as invalid_minutes', r.ok === false && r.error === 'invalid_minutes');
}
{
  const r = sb.pflxParseManualDuration('1', '60');
  check('manual entry: seconds=60 rejected as invalid_seconds (must be 0-59)', r.ok === false && r.error === 'invalid_seconds');
}
{
  const r = sb.pflxParseManualDuration('1', '-1');
  check('manual entry: negative seconds rejected as invalid_seconds', r.ok === false && r.error === 'invalid_seconds');
}
{
  const r = sb.pflxParseManualDuration('1.5', '0');
  check('manual entry: fractional minutes rejected as invalid_minutes', r.ok === false && r.error === 'invalid_minutes');
}
{
  const r = sb.pflxParseManualDuration('0', '59');
  check('manual entry: 0m59s is the smallest valid duration (59s)', r.ok === true && r.totalSeconds === 59);
}
{
  const r = sb.pflxParseManualDuration('1440', '0');
  check('manual entry: exactly 86400s (24h) is accepted at the boundary', r.ok === true && r.totalSeconds === 86400);
}
{
  const r = sb.pflxParseManualDuration('1441', '0');
  check('manual entry: over 86400s (24h) rejected as too_long', r.ok === false && r.error === 'too_long');
}
{
  const r = sb.pflxParseManualDuration(undefined, undefined);
  check('manual entry: undefined inputs default to 0/0 -> zero_duration, no crash', r.ok === false && r.error === 'zero_duration');
}

// ---- pflxTimerAddMinute ----
{
  const r = sb.pflxTimerAddMinute(30, 60, true);
  check('+1 min: running timer with 30s left of 60s -> adds 60s to both remaining and total', r.remainingSeconds === 90 && r.totalSeconds === 120);
}
{
  const r = sb.pflxTimerAddMinute(0, 0, false);
  check('+1 min: idle timer (not running) starts a fresh 60s timer regardless of stale values', r.remainingSeconds === 60 && r.totalSeconds === 60);
}
{
  const r = sb.pflxTimerAddMinute(5, 300, false);
  check('+1 min: idle timer ignores any leftover remaining/total and always yields 60/60', r.remainingSeconds === 60 && r.totalSeconds === 60);
}
{
  const r = sb.pflxTimerAddMinute(NaN, NaN, true);
  check('+1 min: running timer with garbage NaN state degrades to 0 base, not NaN propagation', r.remainingSeconds === 60 && r.totalSeconds === 60);
}
{
  const r = sb.pflxTimerAddMinute(0, 60, true);
  check('+1 min: timer at 0s remaining (about to alarm) still extends by 60s, rescuing it', r.remainingSeconds === 60 && r.totalSeconds === 120);
}

// ---- pflxTimerFitFontSize ----
{
  const size = sb.pflxTimerFitFontSize(0, 0);
  check('fit font: zero container dims falls back to the default 42px, never 0/negative', size === 42);
}
{
  const size = sb.pflxTimerFitFontSize(-100, -50);
  check('fit font: negative container dims (should never happen, but guarded) falls back to 42px', size === 42);
}
{
  const size = sb.pflxTimerFitFontSize(1000, 1000);
  const size2 = sb.pflxTimerFitFontSize(200, 1000);
  check('fit font: a narrow-but-tall box is constrained by width, not height (smaller than a square box)', size2 < size);
}
{
  const size = sb.pflxTimerFitFontSize(10000, 10000);
  check('fit font: a huge dock is clamped at the 320px ceiling, never unbounded', size === 320);
}
{
  const size = sb.pflxTimerFitFontSize(50, 50);
  check('fit font: a tiny dock is clamped at the 28px floor, never unreadably small', size === 28);
}
{
  const size = sb.pflxTimerFitFontSize(NaN, NaN);
  check('fit font: NaN container dims fall back to the default 42px, not NaN/undefined', size === 42);
}
{
  const wide = sb.pflxTimerFitFontSize(920, 400);
  const narrow = sb.pflxTimerFitFontSize(460, 400);
  check('fit font: a wider box (same height) yields a larger or equal font than a narrower one', wide >= narrow);
}

// ---- pflxBroadcastNextCollapsedState ----
{
  check('broadcast collapse: no force arg simply flips currently-collapsed to expanded', bsb.pflxBroadcastNextCollapsedState(true, undefined) === false);
}
{
  check('broadcast collapse: no force arg flips currently-expanded to collapsed', bsb.pflxBroadcastNextCollapsedState(false, undefined) === true);
}
{
  check('broadcast collapse: force=true always collapses regardless of current state', bsb.pflxBroadcastNextCollapsedState(false, true) === true);
}
{
  check('broadcast collapse: force=false always expands regardless of current state', bsb.pflxBroadcastNextCollapsedState(true, false) === false);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
