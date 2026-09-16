// PATCH v224 -- X-Bot FAB idle glow, chat bubble, HOST-tab cyan surfaces follow Reality Warp
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
let pass = 0, fail = 0;
function check(label, cond) { if (cond) { pass++; console.log('PASS: ' + label); } else { fail++; console.log('FAIL: ' + label); } }

check('FAB idle background uses var(--cyan)', /#pflx-dock-fab \{[^}]*color-mix\(in srgb, var\(--cyan, #00f0ff\) 32%, transparent\)/.test(src));
check('FAB idle border uses var(--cyan)', /#pflx-dock-fab \{[^}]*border:1px solid color-mix\(in srgb, var\(--cyan, #00f0ff\) 55%, transparent\)/.test(src));
check('FAB .newmsg status color (green) is UNCHANGED -- status semantics preserved', /#pflx-dock-fab\.newmsg \{ border-color:rgba\(34,197,94,0\.85\)/.test(src));
check('FAB .playing status color (red) is UNCHANGED -- status semantics preserved', /#pflx-dock-fab\.playing \{ border-color:rgba\(255,0,80,0\.85\)/.test(src));
check('.xbot-msg-bubble background uses var(--cyan)', /\.xbot-msg-bubble \{\s*background: color-mix\(in srgb, var\(--cyan, #00f0ff\) 5%, transparent\)/.test(src));
check('HOST tab section labels use var(--cyan)', (src.match(/color:color-mix\(in srgb, var\(--cyan, #00f0ff\) 70%, transparent\);letter-spacing:2px/g) || []).length === 2);
check('Broadcast Message button background/border use var(--cyan)', /id="xbot-host-broadcast-btn" style="[^"]*background:color-mix\(in srgb, var\(--cyan, #00f0ff\) 6%, transparent\)/.test(src));
check('Broadcast SEND button text color uses var(--cyan)', /xbotHostSendBroadcast\(\)" style="width:100%;padding:8px;background:color-mix\(in srgb, var\(--cyan, #00f0ff\) 10%, transparent\);border:1px solid color-mix\(in srgb, var\(--cyan, #00f0ff\) 30%, transparent\);border-radius:6px;color:var\(--cyan, #00f0ff\)/.test(src));
check('Freeze/Random Groups buttons keep their own distinct differentiation colors (blue/purple), untouched by this patch', /if\(typeof lsFreeze==='function'\)lsFreeze\(\);" style="[^"]*background:rgba\(59,130,246,0\.06\)/.test(src) && /if\(typeof lsRandomGroups==='function'\)lsRandomGroups\(\);" style="[^"]*background:rgba\(139,92,246,0\.06\)/.test(src));
check('color-mix technique still has multiple precedents (not novel)', (src.match(/color-mix\(in srgb/g) || []).length >= 10);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
