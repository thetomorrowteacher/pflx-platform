// PATCH PLATFORM v236 -- the Nexus fills the top of Story Mode and fades out.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'preview.html', 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('PASS: ' + m); } else { fail++; console.log('FAIL: ' + m); } }

const pv = /window\.PFLX_PATCH\s*=\s*(\d+)/.exec(src);
ok(pv && +pv[1] >= 236, 'PFLX_PATCH >= 236');
ok(/PATCH PLATFORM v236/.test(src), 'v236 marker present');
ok(/\.sm-hero\{[^}]*min-height:min\(72vh,720px\)/.test(src), 'hero fills the top of the view');
ok(/\.sm-hero::before\{[^}]*mask-image:linear-gradient\(180deg,#000 0%,#000 36%/.test(src),
   'the image is masked to transparent, not veiled with a flat sheet');
ok(/-webkit-mask-image:linear-gradient\(180deg,#000 0%,#000 36%/.test(src),
   'the webkit mask is there too, so it fades in Safari');
ok(/\.sm-hero::before\{[^}]*opacity:\.82/.test(src), 'the art is at full strength, not 34%');
ok(!/\.sm-hero::before\{[^}]*opacity:\.34/.test(src), 'the old 34% veil is gone');
ok(/\.sm-hero-in\{[^}]*padding:min\(34vh,300px\)/.test(src), 'the copy drops below the brightest part');
ok(/@media \(max-width:860px\)\{[\s\S]{0,400}\.sm-hero::after\{background:linear-gradient/.test(src),
   'narrow screens get a contrast floor');
ok(/\.sm-lede\{[^}]*text-shadow/.test(src) && /\.sm-kick\{[^}]*text-shadow/.test(src),
   'hero copy carries a shadow so it survives the lit rim');
// the rest of Story Mode must be untouched
ok(/window\.pflxStoryBoot/.test(src), 'the engine still exports its boot hook');
ok(/SPARK_URL = 'https:\/\/thetomorrowteacher\.github\.io\/sparklab\/'/.test(src), 'the SparkLab embed survived');
ok(/window\.PFLX_STORY\s*=\s*\{/.test(src) && /window\.PFLX_CLIENTS\s*=\s*\{/.test(src),
   'campaign and client data untouched');
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
