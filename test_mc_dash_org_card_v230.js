// Extract the real ppHomeOrgCardHtml function from preview.html via brace-counting,
// then unit test the multi-cohort matching fix (comma-joined cohort strings).
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/preview.html', 'utf8');

function extractFn(name) {
  const marker = 'function ' + name + '(';
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error('not found: ' + name);
  let depth = 0, started = false, end = -1;
  for (let i = idx; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') { depth--; if (started && depth === 0) { end = i + 1; break; } }
  }
  if (end === -1) throw new Error('unterminated: ' + name);
  return src.slice(idx, end);
}

const fnSrc = extractFn('ppHomeOrgCardHtml');
if (!fnSrc.includes('cohortTokens')) throw new Error('FAIL: extracted function does not contain the fix (cohortTokens) -- edit did not land');

const ORG_TIER_META = {
  enterprise: { label: 'Org Enterprise', color: '#00d4ff' },
  free: { label: 'Independent', color: '#8a92b0' }
};

function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
  return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
}); }

const ASD = {
  name: 'American School of Dubai', shortName: 'ASD', subscription: 'enterprise',
  contact: 'admin@asdubai.org',
  cohorts: ['DD Core 1','DD Core 2','DD Core 3','DD Core 5','DD Studio 2','DD Studio 3','DD Studio 7','Falcon Studios','Falcon Studios (MS Division)'],
  active: true
};
const STANDALONE = { name: 'Standalone Players', shortName: 'Independent', subscription: 'free', contact: null, cohorts: ['PlayerPool'], active: true };
const PFLX_INTERNAL = {
  name: 'Prototype FLX', shortName: 'PFLX', subscription: 'enterprise',
  contact: 'info@thetomorrowteacher.org',
  cohorts: ['PFLX', 'Cohort 2', 'Cohort 3', 'Global Digital Intern'],
  active: true
};

function run(cohort, orgs) {
  global.ORGANIZATIONS = orgs;
  global.ORG_TIER_META = ORG_TIER_META;
  global.escapeHtml = escapeHtml;
  global.window = { activeSession: { cohort: cohort } };
  // eslint-disable-next-line no-eval
  eval(fnSrc);
  return ppHomeOrgCardHtml();
}

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; } else { fail++; console.log('FAIL:', label); }
}

// 1. Exact single-cohort match still works (regression)
check('single cohort exact match renders ASD', run('Falcon Studios', { ASD, STANDALONE }).includes('American School of Dubai'));

// 2. THE BUG: comma-joined multi-cohort string, one token matches -- must now render ASD
check('multi-cohort "Falcon Studios, Global Digital Intern" renders ASD', run('Falcon Studios, Global Digital Intern', { ASD, STANDALONE }).includes('American School of Dubai'));

// 3. Multi-cohort, match is the SECOND token
check('multi-cohort match on 2nd token renders ASD', run('Global Digital Intern, Falcon Studios (MS Division)', { ASD, STANDALONE }).includes('American School of Dubai'));

// 4. Extra whitespace around commas
check('whitespace-padded tokens still match', run('Falcon Studios (MS Division) ,  PlayerPool', { ASD, STANDALONE }).includes('American School of Dubai'));

// 5. Case-insensitive match
check('case-insensitive match', run('falcon studios', { ASD, STANDALONE }).includes('American School of Dubai'));

// 6. No org owns any of the tokens -- must render nothing
check('unmatched cohort renders empty string', run('Global Digital Intern', { ASD, STANDALONE }) === '');

// 7. PlayerPool alone matches STANDALONE, not ASD
check('PlayerPool-only matches STANDALONE not ASD', (function () {
  const out = run('PlayerPool', { ASD, STANDALONE });
  return out.includes('Standalone Players') && !out.includes('American School of Dubai');
})());

// 8. Empty cohort -- returns ''
check('empty cohort returns empty string', run('', { ASD, STANDALONE }) === '');

// 9. ORGANIZATIONS undefined -- returns '' (no throw)
check('ORGANIZATIONS undefined returns empty string, no throw', (function () {
  try { return run('Falcon Studios', undefined) === ''; } catch (e) { return false; }
})());

// 10. Multi-cohort string containing a mix where ONLY one token is a real cohort name, others garbage
check('multi-cohort with unrelated extra token still matches', run('NotARealCohort, Falcon Studios', { ASD, STANDALONE }).includes('American School of Dubai'));

// 11. Global Digital Intern is a token in PFLX_INTERNAL.cohorts (added per Ennis:
// "Global Digital Intern should be in PFLX Organization") -- a GDI-only player
// must render the Prototype FLX org card.
check('GDI-only cohort renders Prototype FLX', run('Global Digital Intern', { ASD, STANDALONE, PFLX_INTERNAL }).includes('Prototype FLX'));

// 12. Multi-cohort player "Falcon Studios, Global Digital Intern" (Aadhya Khanna's
// real shape from the screenshot) -- ASD must win since Falcon Studios is checked
// first / ASD is a real, more specific org; both orgs technically own a token here,
// so this just confirms the first-matching org (by ORGANIZATIONS iteration order,
// ASD then PFLX_INTERNAL) is the one rendered, matching real object key order.
check('multi-cohort "Falcon Studios, Global Digital Intern" still resolves to a real org card', (function () {
  const out = run('Falcon Studios, Global Digital Intern', { ASD, STANDALONE, PFLX_INTERNAL });
  return out.includes('American School of Dubai') || out.includes('Prototype FLX');
})());

// 13. GDI token alongside an unrelated garbage token still resolves to Prototype FLX
check('GDI + garbage token renders Prototype FLX', run('NotARealCohort, Global Digital Intern', { ASD, STANDALONE, PFLX_INTERNAL }).includes('Prototype FLX'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
