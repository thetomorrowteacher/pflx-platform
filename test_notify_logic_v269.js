const fs=require('fs');const src=fs.readFileSync(require('path').join(__dirname,'docs/edge-functions/pflx-notify/logic.ts'),'utf8').replace(/^export /gm,'');
const m={};new Function('m',src+';Object.assign(m,{cleanId,itemsOf,prettyBadgeName,badgeHolding,resolveBadge,verifyTaskApproval,rateDecision,existingDecision,eventKeyTask,eventKeyCoin,buildTaskEmail,buildCoinEmail,escapeHtml,MAX_PER_PLAYER_PER_HOUR,MAX_PER_DAY,INFLIGHT_MS,MAX_ATTEMPTS});')(m);
let pass=0,fail=0;const ok=(c,n)=>{c?pass++:(fail++,console.log('FAIL',n))};
ok(m.cleanId('player-1782293539007-n3j3g')==='player-1782293539007-n3j3g','id ok');
ok(m.cleanId('a b')===''&&m.cleanId('x'.repeat(121))===''&&m.cleanId('<script>')===''&&m.cleanId(null)==='','id bad');
ok(m.itemsOf({items:[1]}).length===1&&m.itemsOf([1,2]).length===2&&m.itemsOf(null).length===0,'itemsOf');
ok(m.prettyBadgeName('badge-self-directed-player')==='Self Directed Player'&&m.prettyBadgeName('')==='Digital Coin','pretty');
// badgeHolding
let h=m.badgeHolding([{badges:['a',{id:'b',endorsements:3,name:'Bee'}]},{badges:null}],'b');ok(h.has&&h.endorsements===3&&h.nameFromRecord==='Bee','hold obj');
h=m.badgeHolding([{badges:['a']}],'a');ok(h.has&&h.endorsements===1,'hold str');
h=m.badgeHolding([{badges:['a']},null],'z');ok(!h.has&&h.endorsements===0,'hold none');
h=m.badgeHolding([{badges:[{id:'c',endorsements:2}]},{badges:['c']}],'c');ok(h.endorsements===2,'hold max');
// resolveBadge: never trusts client text; cert special
ok(m.resolveBadge([{id:'x',name:'Cat X',xc:300}],'x','').name==='Cat X'&&m.resolveBadge([{id:'x',name:'Cat X',xc:300}],'x','').xc===300,'cat');
ok(m.resolveBadge([],'pflx-user-cert','').name==='PFLX User Certification','cert');
ok(m.resolveBadge([],'badge-video-editor','').name==='Video Editor','fallback');
ok(m.resolveBadge([],'q','Rec Name').name==='Rec Name','record name');
// verifyTaskApproval
const pl={id:'p1',brand:'BRAND',name:'Nm'};
ok(m.verifyTaskApproval({submissions:[{playerId:'p1',status:'approved'}]},'p1',pl).ok,'sub approved');
ok(!m.verifyTaskApproval({submissions:[{playerId:'p1',status:'pending'}]},'p1',pl).ok,'sub pending');
ok(m.verifyTaskApproval({submissions:[{submittedBy:'BRAND',status:'approved'}]},'p1',pl).ok,'by brand');
ok(!m.verifyTaskApproval({submissions:[{playerId:'p2',status:'approved'}]},'p1',pl).ok&&m.verifyTaskApproval({submissions:[{playerId:'p2',status:'approved'}]},'p1',pl).reason==='not_approved','other player');
ok(m.verifyTaskApproval({status:'approved',submission:{submittedBy:'p1'}},'p1',pl).ok,'legacy approved');
ok(!m.verifyTaskApproval({status:'submitted',submission:{submittedBy:'p1'}},'p1',pl).ok,'legacy not approved');
ok(m.verifyTaskApproval({status:'approved',assignedTo:['p1']},'p1',pl).ok,'assigned');
ok(!m.verifyTaskApproval({status:'approved',assignedTo:['p9']},'p1',pl).ok,'not assigned');
ok(!m.verifyTaskApproval(null,'p1',pl).ok,'no task');
// rate
ok(m.rateDecision(0,0).ok&&m.rateDecision(14,399).ok,'rate ok');
ok(m.rateDecision(15,0).error==='rate_limited'&&m.rateDecision(0,400).error==='daily_cap','rate caps');
// existingDecision
const now=Date.now();
ok(m.existingDecision(null,now)==='new','new');
ok(m.existingDecision({status:'sent'},now)==='deduped','sent');
ok(m.existingDecision({status:'pending',created_at:new Date(now-1000).toISOString()},now)==='inflight','inflight');
ok(m.existingDecision({status:'pending',attempts:1,created_at:new Date(now-200000).toISOString()},now)==='retry','stale pending retry');
ok(m.existingDecision({status:'failed',attempts:3},now)==='gave_up','gave up');
ok(m.existingDecision({status:'rate_limited',attempts:1},now)==='retry','rl retry');
// keys
ok(m.eventKeyTask('t1','p1')==='task:t1:p1'&&m.eventKeyCoin('p1','b',2)==='coin:p1:b:2','keys');
// emails escape + content
let e=m.buildTaskEmail({name:'<b>Ann</b>',title:'Make "a" <img src=x onerror=1>',xc:1500,unsubUrl:'https://x/?a=1&t=2'});
ok(!/<img/.test(e.html)&&/&lt;img/.test(e.html)&&!/<b>Ann/.test(e.html),'task escape');
ok(/Task approved/.test(e.subject)&&/1,500 XC/.test(e.text)&&/Stop these emails/.test(e.html)&&/&amp;t=2/.test(e.html),'task content');
e=m.buildCoinEmail({name:'Bo',badgeName:'Video Editor',xc:300,endorsements:5,unsubUrl:'https://u'});
ok(/Video Editor/.test(e.subject)&&/x5/.test(e.text)&&/300 XC/.test(e.html),'coin content');
e=m.buildCoinEmail({name:'Bo',badgeName:'B',xc:0,endorsements:1,unsubUrl:'u'});ok(!/XC value/.test(e.html)&&!/x1/.test(e.text),'coin no xc/x1');
// platform wiring (static checks on preview.html)
const html=fs.readFileSync(require('path').join(__dirname,'preview.html'),'utf8');
ok(/window\.PFLX_PATCH\s*=\s*(26[9]|2[7-9]\d);/.test(html),'patch >= 269');
ok(html.includes("window.pflxEmailNotify = function (kind, playerId, ref)"),'helper defined');
ok(html.includes("pflxEmailNotify('task_approved', pid, task.id)"),'per-player approve hook');
ok(html.includes("pflxEmailNotify('task_approved', submitterId, task.id)"),'legacy approve hook');
ok(html.includes("pflxEmailNotify('coin', playerId, awardObj.badge.id)"),'award() hook');
ok(html.includes("pflxEmailNotify('coin', p.id, BADGE_ID)"),'cert hook');
ok(html.includes('/functions/v1/pflx-notify'),'endpoint');
ok(!/window\.pflxNotify\s*=\s*function[^\n]*pflxEmailNotify/.test(html),'in-app pflxNotify untouched');
console.log('pass',pass,'fail',fail);process.exit(fail?1:0);
