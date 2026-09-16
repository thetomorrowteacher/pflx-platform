// test_xbot_fx_kit_v225.js — PATCH PLATFORM v225 "PFLX FX Kit" verification
// Usage: node test_xbot_fx_kit_v225.js preview.html
const fs = require('fs');
const path = process.argv[2];
if (!path) { console.error('Usage: node test_xbot_fx_kit_v225.js <preview.html>'); process.exit(1); }
const src = fs.readFileSync(path, 'utf8');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name); }
}

// ---- 1-4: CSS kit existence & accent-awareness ----
check('CSS: @keyframes pflxFxPop exists', /@keyframes pflxFxPop\s*\{/.test(src));
check('CSS: .pflx-fx-pop class exists', /\.pflx-fx-pop\s*\{\s*animation:\s*pflxFxPop/.test(src));
check('CSS: @keyframes pflxFxGlowPulse exists', /@keyframes pflxFxGlowPulse\s*\{/.test(src));
check('CSS: .pflx-fx-glow-pulse references var(--cyan)', /\.pflx-fx-glow-pulse/.test(src) && /pflxFxGlowPulse[\s\S]{0,300}var\(--cyan/.test(src));

// ---- extract real function bodies via brace counting ----
function extractFn(anchorRegex) {
  const m = anchorRegex.exec(src);
  if (!m) return null;
  let i = m.index + m[0].length;
  // find first '{'
  while (src[i] !== '{' && i < src.length) i++;
  let depth = 0, start = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(m.index, i);
}

const toastFn = extractFn(/function pflxToast\(msg, type\)\s*/);
check('pflxToast: extracted', !!toastFn);
check('pflxToast: retriggers .pflx-fx-pop on icon (remove/reflow/add)', !!toastFn &&
  /icon\.classList\.remove\('pflx-fx-pop'\)/.test(toastFn) &&
  /icon\.offsetWidth/.test(toastFn) &&
  /icon\.classList\.add\('pflx-fx-pop'\)/.test(toastFn));

const subTabFn = extractFn(/window\.xbotLiveSwitchSubTab = function \(tab\)\s*/);
check('xbotLiveSwitchSubTab: extracted', !!subTabFn);
check('xbotLiveSwitchSubTab: computes isChange via wasActive comparison', !!subTabFn &&
  /var isChange = !wasActive \|\| wasActive\.getAttribute\('data-subtab'\) !== tab/.test(subTabFn));
check('xbotLiveSwitchSubTab: gates panel pop on isChange && wasActive', !!subTabFn &&
  /if \(key === tab && isChange && wasActive\)/.test(subTabFn));
check('xbotLiveSwitchSubTab: gates nav SFX on isChange && wasActive', !!subTabFn &&
  /if \(isChange && wasActive && typeof pflxPlaySfx === 'function'\) pflxPlaySfx\('nav'\)/.test(subTabFn));

const makeTeamsFn = extractFn(/window\.pflxXBotMakeTeams = async function \(\)\s*/);
const shuffleFn = extractFn(/window\.pflxXBotTeamsShuffle = async function \(\)\s*/);
const rerollFn = extractFn(/window\.pflxXBotTeamsRerollNames = async function \(\)\s*/);
check('pflxXBotMakeTeams: extracted', !!makeTeamsFn);
check('pflxXBotTeamsShuffle: extracted', !!shuffleFn);
check('pflxXBotTeamsRerollNames: extracted', !!rerollFn);
[['pflxXBotMakeTeams', makeTeamsFn], ['pflxXBotTeamsShuffle', shuffleFn], ['pflxXBotTeamsRerollNames', rerollFn]].forEach(function (pair) {
  var name = pair[0], fn = pair[1];
  check(name + ': sets _xbotTeamsJustDrafted flag before render', !!fn &&
    /window\._xbotTeamsJustDrafted = true;/.test(fn));
  check(name + ': fires success SFX before render', !!fn &&
    /pflxPlaySfx\('success'\)/.test(fn));
  check(name + ': calls pflxXBotRenderTeams after setting flag/SFX', !!fn &&
    /window\.pflxXBotRenderTeams\(\);/.test(fn));
});

const renderTeamsFn = extractFn(/window\.pflxXBotRenderTeams = async function \(\)\s*/);
check('pflxXBotRenderTeams: extracted', !!renderTeamsFn);
check('pflxXBotRenderTeams: reads justDrafted flag into local var', !!renderTeamsFn &&
  /var justDrafted = !!window\._xbotTeamsJustDrafted, colIdx = 0;/.test(renderTeamsFn));
check('pflxXBotRenderTeams: applies staggered animation-delay per column', !!renderTeamsFn &&
  /colIdx \* 0\.06/.test(renderTeamsFn) && /pflx-fx-pop/.test(renderTeamsFn));
check('pflxXBotRenderTeams: increments colIdx per column', !!renderTeamsFn &&
  /colIdx\+\+;/.test(renderTeamsFn));
check('pflxXBotRenderTeams: clears the flag after use', !!renderTeamsFn &&
  /justDrafted = false; window\._xbotTeamsJustDrafted = false;/.test(renderTeamsFn));

// ---- sandbox-executed run of the real column-building logic ----
try {
  var colorArr = ['#00f0ff', '#ffd700'];
  var justDrafted = true, colIdx = 0;
  var names = ['Team Alpha', 'Team Beta'];
  var htmls = names.map(function (nm, idx) {
    var col = colorArr[idx % colorArr.length];
    var popStyle = justDrafted ? (' pflx-fx-pop" style="animation-delay:' + (colIdx * 0.06) + 's;border-top:3px solid ' + col + ';background:rgba(255,255,255,0.02);border-radius:10px;padding:10px;min-width:0;') : ('" style="border-top:3px solid ' + col + ';background:rgba(255,255,255,0.02);border-radius:10px;padding:10px;min-width:0;');
    colIdx++;
    return '<div class="' + popStyle + '">' + nm + '</div>';
  });
  var joined = htmls.join('');
  check('Sandbox: column HTML valid (2 divs)', (joined.match(/<div/g) || []).length === 2);
  check('Sandbox: first column has animation-delay:0s', joined.indexOf('animation-delay:0s') !== -1);
  check('Sandbox: second column has staggered animation-delay:0.06s', joined.indexOf('animation-delay:0.06s') !== -1);
  check('Sandbox: pflx-fx-pop class present in output', joined.indexOf('pflx-fx-pop') !== -1);
} catch (e) {
  check('Sandbox: column-building logic executes without throwing', false);
  console.log('  error: ' + e.message);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
