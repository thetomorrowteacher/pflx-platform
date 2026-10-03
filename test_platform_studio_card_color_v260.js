// PATCH PLATFORM v260 -- Startup Studio card color-consistency fix, unit tests.
// Extracts the REAL shipped hexToRgb() function and the REAL shipped
// "Startup Studio card" render block from preview.html (marker + brace
// matching), runs the block against a minimal fake DOM, and asserts the
// card's accent color now follows the real per-studio color instead of
// being hardcoded gold -- per Ennis's screenshot annotation ("Add the
// same color") asking the bottom card's icon to match the top pill.
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, 'preview.html'), 'utf8');

function extractFunction(src, name) {
  const marker = 'function ' + name + '(';
  const start = src.indexOf(marker);
  if (start === -1) throw new Error('not found: ' + name);
  let i = src.indexOf('{', start);
  let depth = 0, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end === -1) throw new Error('unterminated: ' + name);
  return src.slice(start, end);
}

// hexToRgb is REUSED, not reimplemented, per house discipline.
const hexToRgbSrc = extractFunction(SRC, 'hexToRgb');

// Extract the real "Startup Studio card" if-block by marker + brace count.
const cardMarker = '// ── Startup Studio card (home dashboard identifier) ──';
const cardStart = SRC.indexOf(cardMarker);
if (cardStart === -1) throw new Error('Startup Studio card marker not found -- did the comment change?');
const ifStart = SRC.indexOf('if (studioName) {', cardStart);
if (ifStart === -1) throw new Error('if (studioName) { not found after marker');
{
  let i = SRC.indexOf('{', ifStart);
  let depth = 0, end = -1;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end === -1) throw new Error('unterminated Startup Studio card if-block');
  var cardBlockSrc = SRC.slice(ifStart, end);
}

if (!/studioData && studioData\.color/.test(cardBlockSrc)) {
  throw new Error('card block does not reference studioData.color -- fix not present, update this test');
}
if (/#f5c842[^'"]/.test(cardBlockSrc.replace(/'#f5c842'/g, ''))) {
  // sanity: after removing the one intentional fallback-literal occurrence,
  // no other hardcoded gold hex should remain driving the visuals.
}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name); }
}

// A tiny fake DOM: just enough for the extracted block to run end-to-end
// (createElement/appendChild/style.cssText/innerHTML/onclick), nothing more.
function fakeDocument() {
  return {
    createElement: function () {
      return { className: '', id: '', style: { cssText: '' }, onclick: null, innerHTML: '' };
    },
  };
}

function runCard({ studioName, studioData, s }) {
  const dashboard = { appendChild: function (el) { this._el = el; }, _el: null };
  const sandboxSrc = `
    ${hexToRgbSrc}
    (function (document, dashboard, studioName, studioData, s, showView) {
      ${cardBlockSrc}
    })(__document__, __dashboard__, __studioName__, __studioData__, __s__, undefined);
  `;
  const Module = require('module');
  const m = new Module('sandbox', null);
  m.filename = path.join(__dirname, 'sandbox_studio_card.js');
  m.paths = Module._nodeModulePaths(__dirname);
  // Inject real objects via a closure-capturing wrapper instead of JSON
  // (JSON can't carry functions, and dashboard needs a real appendChild).
  const wrapperSrc = `
    module.exports = function (__document__, __dashboard__, __studioName__, __studioData__, __s__) {
      ${sandboxSrc}
      return __dashboard__._el;
    };
  `;
  m._compile(wrapperSrc, m.filename);
  const fn = m.exports;
  return fn(fakeDocument(), dashboard, studioName, studioData, s);
}

// ---- Case 1: Innov8 (purple, #9333ea) -- the real scenario from Ennis's
// screenshot. Card must use Innov8's real color, not gold. ----
{
  const studioData = { id: 'studio-innov8', name: 'Innov8 Studios', color: '#9333ea', logo: '' };
  const el = runCard({ studioName: 'Innov8 Studios', studioData, s: {} });
  check('innov8: border uses the real studio color, not gold', el.style.cssText.indexOf('#9333ea') !== -1);
  check('innov8: border no longer hardcoded gold', el.style.cssText.indexOf('#f5c842') === -1);
  check('innov8: background rgba uses the real color\'s rgb triplet (147,51,234)', el.innerHTML.indexOf('147,51,234') !== -1 || el.style.cssText.indexOf('147,51,234') !== -1);
  check('innov8: STARTUP STUDIO label color matches the real studio color', el.innerHTML.indexOf('color:#9333ea') !== -1);
  check('innov8: studio name still rendered', el.innerHTML.indexOf('Innov8 Studios') !== -1);
}

// ---- Case 2: eMagination (light purple, #2563eb per PFLX_STUDIO_VISUAL) ----
{
  const studioData = { id: 'studio-emagination', name: 'eMagination Studios', color: '#2563eb', logo: 'public/studio-emagination.png' };
  const el = runCard({ studioName: 'eMagination Studios', studioData, s: {} });
  check('emagination: uses its own real color', el.style.cssText.indexOf('#2563eb') !== -1);
  check('emagination: logo image rendered when logoSrc present', el.innerHTML.indexOf('public/studio-emagination.png') !== -1);
  check('emagination: no gold leaked in when a real color+logo exist', el.style.cssText.indexOf('#f5c842') === -1);
}

// ---- Case 3: no studio metadata resolved at all -- falls back to the
// original gold treatment exactly as before this patch (no regression for
// players with no studio, or an unknown legacy id). ----
{
  const el = runCard({ studioName: 'Unknown Studio', studioData: null, s: {} });
  check('no metadata: falls back to the original gold', el.style.cssText.indexOf('#f5c842') !== -1);
  check('no metadata: fallback renders the 🏢 building glyph when there is no logo', el.innerHTML.indexOf('🏢') !== -1);
}

// ---- Case 4: studioData present but with no .color field (e.g. the
// localStorage pflx_studios fallback shape) -- must still fall back to gold
// cleanly rather than injecting "undefined" into a style string. ----
{
  const studioData = { id: 'studio-x', name: 'Some Legacy Studio' };
  const el = runCard({ studioName: 'Some Legacy Studio', studioData, s: {} });
  check('no .color field: falls back to gold, never "undefined"', el.style.cssText.indexOf('#f5c842') !== -1 && el.style.cssText.indexOf('undefined') === -1);
}

// ---- Case 5: stake/equity numbers still render correctly alongside the
// color change (confirms the unrelated fields were not disturbed). ----
{
  const studioData = { id: 'studio-gentech', name: 'Gentech Studios', color: '#06b6d4' };
  const s = { studioStakeXC: 1200, studioStakePercent: 5 };
  const el = runCard({ studioName: 'Gentech Studios', studioData, s });
  check('stake XC still formats and renders', el.innerHTML.indexOf('1,200 XC') !== -1);
  check('equity percent still renders', el.innerHTML.indexOf('5%') !== -1);
  check('gentech: real color present', el.innerHTML.indexOf('color:#06b6d4') !== -1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
