// PATCH PLATFORM v200: Ennis -- "Change the location of the hide option."
// (screenshot: arrow from the ☰ button to the X logo). Checks the real markup.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let pass = 0, fail = 0;
function check(l, c) { if (c) { pass++; console.log('PASS: ' + l); } else { fail++; console.log('FAIL: ' + l); } }
check('PFLX_PATCH bumped to 200', src.indexOf('window.PFLX_PATCH   = 200;') !== -1);
check('exactly one hide/show toggle button', src.split('id="pflx-dock-tabs-toggle"').length === 2);
const h0 = src.indexOf('<div class="pflx-dock-header" id="pflx-dock-header">');
const h1 = src.indexOf('<div class="pflx-dock-body" id="pflx-dock-body">', h0);
const head = src.slice(h0, h1);
const iLogo = head.indexOf('X Official for PFLX.png');
const iBtn = head.indexOf('id="pflx-dock-tabs-toggle"');
const iTabs = head.indexOf('<div class="pflx-dock-tabs">');
const iSizes = head.indexOf('pflx-dock-size-btns');
check('toggle sits inside the dock header', iBtn !== -1);
check('toggle comes right after the X logo', iLogo !== -1 && iLogo < iBtn);
check('toggle comes before the X-BOT / P2P CHAT tabs', iBtn < iTabs);
check('toggle is no longer in the right-hand cluster', iBtn < iSizes);
check('still a .pflx-dock-hbtn (drag handler ignores it, .on styling applies)', /class="pflx-dock-hbtn[^"]*" id="pflx-dock-tabs-toggle"/.test(head));
check('left-placement CSS present', src.indexOf('.pflx-dock-hbtn-left {') !== -1);
check('JS still wires the toggle by id', src.indexOf("document.getElementById('pflx-dock-tabs-toggle')") !== -1);
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
