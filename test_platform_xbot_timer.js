// Unit tests for the Cyberpunk X-Bot Timer patch (pflxTimerDisplayState / pflxTimerShouldChime).
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
    'function pflxTimerDisplayState(remainingSeconds, totalSeconds) {',
    'window.pflxTimerShouldChime = pflxTimerShouldChime;\n'
  );
  const full = body +
    '\nsandbox.pflxTimerDisplayState = pflxTimerDisplayState;' +
    '\nsandbox.pflxTimerShouldChime = pflxTimerShouldChime;\n';
  new Function('sandbox', 'with (sandbox) {\n' + full + '\n}')(sandbox);
  return sandbox;
}

const sb = makeSandbox();

// ---- pflxTimerDisplayState -- state boundaries ----
{
  const st = sb.pflxTimerDisplayState(300, 300);
  check('normal: 5:00 remaining is normal/cyan', st.state === 'normal' && st.color === 'cyan');
  check('normal: display formats as MM:SS (05:00)', st.display === '05:00');
  check('normal: countdownNum is null outside critical', st.countdownNum === null);
}
{
  const st = sb.pflxTimerDisplayState(61, 300);
  check('boundary: 61s remaining is still normal (just above the 60s warning threshold)', st.state === 'normal');
}
{
  const st = sb.pflxTimerDisplayState(60, 300);
  check('boundary: exactly 60s remaining enters warning (within the last minute)', st.state === 'warning' && st.color === 'yellow');
}
{
  const st = sb.pflxTimerDisplayState(11, 300);
  check('boundary: 11s remaining is still warning, not critical yet', st.state === 'warning');
}
{
  const st = sb.pflxTimerDisplayState(10, 300);
  check('boundary: exactly 10s remaining enters critical (start of the 10-9-8 countdown)', st.state === 'critical');
  check('critical: countdownNum is populated and equals the remaining whole seconds', st.countdownNum === 10);
}
{
  const st = sb.pflxTimerDisplayState(1, 300);
  check('boundary: 1s remaining is critical with countdownNum 1', st.state === 'critical' && st.countdownNum === 1);
}
{
  const st = sb.pflxTimerDisplayState(0, 300);
  check('boundary: 0s remaining is alarm (time is up)', st.state === 'alarm' && st.color === 'red');
  check('alarm: countdownNum is null (no more countdown once alarm fires)', st.countdownNum === null);
}
{
  const st = sb.pflxTimerDisplayState(-5, 300);
  check('negative remaining time is clamped to the alarm state, never a negative display', st.state === 'alarm' && st.remainingSeconds === 0);
}
{
  const st = sb.pflxTimerDisplayState(125, 300);
  check('display formatting pads seconds correctly (02:05)', st.display === '02:05');
}

// ---- pflxTimerShouldChime -- per-minute chime boundary logic ----
{
  check('chime: never fires at the very start (remaining === total)', sb.pflxTimerShouldChime(300, 300) === false);
}
{
  check('chime: fires exactly on a 60s-multiple boundary mid-countdown (180 of 300)', sb.pflxTimerShouldChime(180, 300) === true);
}
{
  check('chime: does not fire on a non-minute-boundary second (179 of 300)', sb.pflxTimerShouldChime(179, 300) === false);
}
{
  check('chime: does not fire once time has run out (0 remaining)', sb.pflxTimerShouldChime(0, 300) === false);
}
{
  check('chime: does not fire on a negative/overshoot value', sb.pflxTimerShouldChime(-3, 300) === false);
}
{
  check('chime: fires at 60s remaining (the last full minute mark) on a 5-minute timer', sb.pflxTimerShouldChime(60, 300) === true);
}
{
  // a 1-minute timer never chimes mid-run since its only 60s-multiple point is the start (excluded) and 0 (excluded)
  check('chime: a 1-minute timer never chimes (start excluded, 0 excluded, nothing in between is a 60s multiple)', sb.pflxTimerShouldChime(30, 60) === false);
}
{
  // a 3-minute timer chimes at the 2:00 and 1:00 marks, not at start or zero
  check('chime: a 3-minute timer chimes at the 2-minute mark (120 of 180)', sb.pflxTimerShouldChime(120, 180) === true);
  check('chime: a 3-minute timer chimes at the 1-minute mark (60 of 180)', sb.pflxTimerShouldChime(60, 180) === true);
  check('chime: a 3-minute timer does NOT chime at its own start (180 of 180)', sb.pflxTimerShouldChime(180, 180) === false);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
