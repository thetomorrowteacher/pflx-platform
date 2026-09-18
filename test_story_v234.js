// PATCH PLATFORM v234 -- SparkLab embedded in Story Mode's Ideate quests.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'preview.html', 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('PASS: ' + m); } else { fail++; console.log('FAIL: ' + m); } }

const pv = /window\.PFLX_PATCH\s*=\s*(\d+)/.exec(src);
ok(pv && +pv[1] >= 234, 'PFLX_PATCH >= 234');
ok(/PATCH PLATFORM v234/.test(src), 'v234 marker present');
ok(/SPARK_URL = 'https:\/\/thetomorrowteacher\.github\.io\/sparklab\/'/.test(src),
   'SparkLab points at its own GitHub Pages build, not the Canva site');
ok((src.match(/sparkEmbed\(/g) || []).length >= 4,
   'all three Ideate rounds embed the board (plus the helper)');
ok(/sparkEmbed\(1,/.test(src) && /sparkEmbed\(2,/.test(src) && /sparkEmbed\(3,/.test(src),
   'rounds one, two and three each get their own framing');
ok(/data-sparkbig=/.test(src) && /classList\.toggle\('big'\)/.test(src), 'the Bigger toggle is wired');
ok(/Open in a tab/.test(src) && /it needs internet/.test(src), 'there is an out-of-frame fallback');
ok(/\.sm-spark iframe\{/.test(src) && /\.sm-spark\.big iframe\{/.test(src), 'embed css shipped');
ok(/loading="lazy"/.test(src), 'the frame is lazy so the quest list stays fast');
// naming discipline: SparkLab is the Ideation Development Game, never a design thinking game
const win = src.slice(Math.max(0, src.indexOf('SPARK_URL')) - 4000, src.indexOf('SPARK_URL') + 8000);
ok(!/SparkLab[^.]{0,80}design thinking/i.test(win) && !/design thinking[^.]{0,40}SparkLab/i.test(win),
   'SparkLab is never called a design thinking game');
ok(/Worst Idea|worst-possible-idea/i.test(src), 'Round One is still the Worst Idea Technique');
ok(/Idea Generator/.test(src), 'Round Two names the Idea Generator');
// the v233 surface must survive the swap
ok(/window\.pflxStoryBoot/.test(src), 'the engine still exports its boot hook');
ok(/PflxDataBus\.award\(pid\(\)/.test(src), 'rewards still route through the data bus');
ok(/window\.PFLX_STORY\s*=\s*\{/.test(src) && /window\.PFLX_CLIENTS\s*=\s*\{/.test(src),
   'campaign and client data untouched');
ok(src.indexOf('PATCH PLATFORM v233') !== src.lastIndexOf('PATCH PLATFORM v233'),
   'v233 sentinels still wrap the module');
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
