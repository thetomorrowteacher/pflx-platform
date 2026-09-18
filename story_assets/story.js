/* ═══ PFLX STORY MODE — engine ═══════════════════════════════════════════
   The season played as a campaign. Acts are the two projects from the
   Activity Guide; quests are the steps a student actually has to do; the
   clients are the leads of The Nexus Narratives. Progress lives per player
   in app_data key pflx_story_<playerId>, mirrored to localStorage.        */
(function () {
  'use strict';
  var D = window.PFLX_STORY, CL = window.PFLX_CLIENTS;
  if (!D) return;

  /* ── platform bridges, each with a dev fallback ─────────────────────── */
  function pid() {
    try { var s = window.activeSession || {}; if (s.id) return String(s.id); } catch (e) {}
    return 'dev-player';
  }
  function pname() {
    try { var s = window.activeSession || {}; return s.name || s.username || 'Player'; } catch (e) { return 'Player'; }
  }
  function award(xc, xp, reason) {
    try {
      if (window.PflxDataBus && window.PflxDataBus.award) {
        window.PflxDataBus.award(pid(), { xc: xc, source: 'story', reason: reason });
      }
    } catch (e) {}
    try { if (window.pflxPlaySfx) window.pflxPlaySfx('badge'); } catch (e) {}
    S.xc += xc; S.xp += xp;
  }
  function artUrl(k) { return (window.PFLX_STORY_ART || 'public/story-art/') + k + '.jpg'; }
  function toast(msg, accent) {
    var t = document.createElement('div');
    t.className = 'sm-toast'; t.style.setProperty('--c', accent || '0,240,255');
    t.textContent = msg; document.body.appendChild(t);
    setTimeout(function () { t.classList.add('go'); }, 20);
    setTimeout(function () { t.classList.remove('go'); setTimeout(function () { t.remove(); }, 400); }, 3200);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── save state ─────────────────────────────────────────────────────── */
  var KEY = function () { return 'pflx_story_' + pid(); };
  var S = blank();
  function blank() {
    return { v: 1, studio: '', done: {}, at: '', xc: 0, xp: 0,
             traits: {}, forge: '', hero: {}, brand: {}, client: '',
             iv: { asked: [], clues: [] }, cprofile: {},
             emp: { says: [], thinks: [], does: [], feels: [], problem: '' },
             spark: { r1: ['', '', ''], r2: ['', '', ''], r3: '', merged: '', views: [] },
             log: [], feed: { learned: '', gave: [], took: [], change: '' },
             exhibit: {}, pitch: {}, evalr: {}, subs: {} };
  }
  function save() {
    S.at = new Date().toISOString();
    try { localStorage.setItem(KEY(), JSON.stringify(S)); } catch (e) {}
    try { if (window.pflxCloudKvPush) window.pflxCloudKvPush(KEY(), S); } catch (e) {}
  }
  function load(cb) {
    var got = false;
    try {
      var raw = localStorage.getItem(KEY());
      if (raw) { S = Object.assign(blank(), JSON.parse(raw)); got = true; }
    } catch (e) {}
    try {
      if (window.pflxCloudKvLoad) {
        window.pflxCloudKvLoad(KEY(), function (v) {
          if (v && typeof v === 'object' && (!S.at || (v.at || '') > S.at)) {
            S = Object.assign(blank(), v); render();
          }
        }, KEY());
      }
    } catch (e) {}
    if (cb) cb(got);
  }
  window.pflxStoryState = function () { return S; };
  window.pflxStoryReset = function () { S = blank(); save(); render(); };

  /* ── campaign helpers ───────────────────────────────────────────────── */
  var QUESTS = {};
  D.acts.forEach(function (a) { a.quests.forEach(function (q) { q.act = a; QUESTS[q.id] = q; }); });
  var ALL = Object.keys(QUESTS);

  function isDone(id) { return !!S.done[id]; }
  function locked(q) {
    if (!q.needs) return false;
    for (var i = 0; i < q.needs.length; i++) if (!isDone(q.needs[i])) return true;
    return false;
  }
  function actDone(a) { return a.quests.filter(function (q) { return isDone(q.id); }).length; }
  function pct() { return Math.round(100 * ALL.filter(isDone).length / ALL.length); }
  function complete(q, silent) {
    if (isDone(q.id)) { save(); return; }
    S.done[q.id] = new Date().toISOString();
    award(q.xc, q.xp, 'Story Mode: ' + q.title);
    save();
    if (!silent) toast('+' + q.xc + ' X-Coin  ·  ' + q.title + ' complete', q.act.accent);
    try {
      if (window.PflxDataBus && window.PflxDataBus.broadcastAll) {
        window.PflxDataBus.broadcastAll({ type: 'pflx_story_progress', questId: q.id,
          act: q.act.id, pct: pct(), playerId: pid() });
      }
    } catch (e) {}
  }
  window.pflxStoryPct = pct;

  /* ── router ─────────────────────────────────────────────────────────── */
  var view = { name: 'map', qid: '' };
  window.pflxStoryGo = function (name, qid) {
    view = { name: name, qid: qid || '' };
    render();
    var host = document.getElementById('sm-root');
    if (host) host.scrollTop = 0;
    var v = document.querySelector('.story-view'); if (v) v.scrollTop = 0;
  };
  function go(n, q) { window.pflxStoryGo(n, q); }

  /* ── render ─────────────────────────────────────────────────────────── */
  function render() {
    var el = document.getElementById('sm-root');
    if (!el) return;
    if (view.name === 'quest' && QUESTS[view.qid]) el.innerHTML = questHtml(QUESTS[view.qid]);
    else el.innerHTML = mapHtml();
    wire(el);
  }
  window.pflxStoryRender = function () { render(); };

  /* ── the campaign map ───────────────────────────────────────────────── */
  function mapHtml() {
    var p = pct(), h = '';
    h += '<div class="sm-hero" style="--bg:url(' + artUrl(D.acts[0].art) + ')">' +
         '<div class="sm-hero-in">' +
         '<div class="sm-kick">Prototype FLX · Season Campaign</div>' +
         '<h1 class="sm-mast">Story Mode</h1>' +
         '<p class="sm-lede">Two projects, one campaign. Build your Alter Ego, take a client out of The Nexus Narratives, and run them through Design Thinking until the problem gives way.</p>' +
         '<div class="sm-hudrow">' +
           hud('Progress', p + '%') + hud('Quests', ALL.filter(isDone).length + ' / ' + ALL.length) +
           hud('Story X-Coin', S.xc) + hud('Story XP', S.xp) +
           hud('Studio', S.studio ? studioName(S.studio) : '—') +
           hud('Client', S.client ? clientName(S.client) : '—') +
         '</div>' +
         '<div class="sm-bar"><i style="width:' + p + '%"></i></div>' +
         '</div></div>';

    h += '<div class="sm-path">';
    D.acts.forEach(function (a, ai) {
      var dn = actDone(a), tot = a.quests.length, open = a.quests.some(function (q) { return !locked(q); });
      h += '<section class="sm-act' + (dn === tot ? ' done' : '') + '" style="--c:' + a.accent + '">';
      h += '<div class="sm-act-art" style="background-image:url(' + artUrl(a.art) + ')"></div>';
      h += '<div class="sm-act-head"><div class="sm-act-n">' + esc(a.n) + (a.race ? ' · RACE' : '') + '</div>' +
           '<h2>' + esc(a.title) + '</h2><div class="sm-act-sub">' + esc(a.sub) + '</div>' +
           '<div class="sm-act-prog">' + dn + ' of ' + tot + ' complete' +
           (open ? '' : ' · locked') + '</div></div>';
      h += '<div class="sm-nodes">';
      a.quests.forEach(function (q, qi) {
        var d = isDone(q.id), lk = locked(q);
        h += '<button class="sm-node' + (d ? ' done' : '') + (lk ? ' lock' : '') + '" data-q="' + q.id + '">' +
             '<span class="sm-dot">' + (d ? '✓' : (lk ? '🔒' : (qi + 1))) + '</span>' +
             '<span class="sm-nbody"><span class="sm-ntitle">' + esc(q.title) + '</span>' +
             '<span class="sm-nblurb">' + esc(q.blurb) + '</span>' +
             '<span class="sm-nmeta">' + q.xc + ' XC · ' + q.xp + ' XP · ~' + q.mins + ' min' +
             (q.cp ? ' · ' + esc(q.cp) : '') + (q.repeat ? ' · repeatable' : '') + '</span></span></button>';
      });
      h += '</div></section>';
    });
    h += '</div>';
    return h;
  }
  function hud(k, v) {
    return '<div class="sm-hud"><b>' + esc(v) + '</b><span>' + esc(k) + '</span></div>';
  }
  function studioName(id) {
    var o = (D.acts[0].quests[1].options || []).filter(function (x) { return x.id === id; })[0];
    return o ? o.name : id;
  }
  function clientName(k) {
    var c = client(k); return c ? c.name : k;
  }
  function client(k) {
    if (!CL) return null;
    return CL.clients.filter(function (c) { return c.key === (k || S.client); })[0] || null;
  }

  /* ── quest shell ────────────────────────────────────────────────────── */
  function shell(q, body, footer) {
    var lk = locked(q), d = isDone(q.id);
    var h = '<div class="sm-qwrap" style="--c:' + q.act.accent + '">';
    h += '<div class="sm-qtop"><button class="sm-back" data-back="1">← Campaign map</button>' +
         '<span class="sm-qact">' + esc(q.act.n) + ' · ' + esc(q.act.title) + '</span>' +
         (d ? '<span class="sm-badge done">Complete</span>' : '') + '</div>';
    h += '<div class="sm-qhero" style="background-image:url(' + artUrl(q.act.art) + ')"></div>';
    h += '<div class="sm-qhead"><h2>' + esc(q.title) + '</h2><p>' + esc(q.blurb) + '</p>' +
         '<div class="sm-qmeta">' + q.xc + ' X-Coin · ' + q.xp + ' XP · about ' + q.mins + ' minutes' +
         (q.cp ? ' · ' + esc(q.cp) : '') + '</div></div>';
    if (lk) {
      h += '<div class="sm-lock">Finish ' + q.needs.filter(function (n) { return !isDone(n); })
           .map(function (n) { return '<b>' + esc(QUESTS[n] ? QUESTS[n].title : n) + '</b>'; }).join(' and ') +
           ' to open this.</div>';
    } else {
      h += '<div class="sm-qbody">' + body + '</div>';
      if (footer) h += '<div class="sm-qfoot">' + footer + '</div>';
    }
    return h + '</div>';
  }
  function doneBtn(q, label, id) {
    return '<button class="sm-btn go" data-done="' + q.id + '"' + (id ? ' data-guard="' + id + '"' : '') + '>' +
           esc(label || (isDone(q.id) ? 'Save' : 'Complete quest · +' + q.xc + ' XC')) + '</button>';
  }
  function linkBtn(q) {
    if (!q.link || !D.canva[q.link]) return '';
    var names = { characterForge: 'Open Character Forge', brandBoardHow: 'Watch: how to make a Brand Board',
      briefing: 'Open the Client Briefing deck', clientProfile: 'Open the Client Profile template',
      empathyMap: 'Open the Empathy Map template', sparkLab: 'Open SparkLab',
      thinkTable: 'Open ThinkTable AI', protoDev: 'Open ProtoDev AI', ideationForm: 'Open the Ideation Form' };
    return '<a class="sm-btn out" target="_blank" rel="noopener" href="' + esc(D.canva[q.link]) + '">' +
           esc(names[q.link] || 'Open the tool') + ' ↗</a>';
  }
  function fld(k, label, val, ph, big) {
    return '<label class="sm-f"><span>' + esc(label) + '</span>' +
      (big ? '<textarea data-k="' + k + '" rows="' + big + '" placeholder="' + esc(ph || '') + '">' + esc(val || '') + '</textarea>'
           : '<input data-k="' + k + '" value="' + esc(val || '') + '" placeholder="' + esc(ph || '') + '">') +
      '</label>';
  }

  /* ── quest bodies by kind ───────────────────────────────────────────── */
  function questHtml(q) {
    var f = { beat: qBeat, studio: qStudio, traits: qTraits, forge: qForge, charprofile: qCharProfile,
      board: qBoard, mint: qMint, pick: qPick, interview: qInterview, cprofile: qCProfile,
      empathy: qEmpathy, submit: qSubmit, spark1: qSpark1, spark2: qSpark2, spark3: qSpark3,
      merge: qMerge, logstart: qLogStart, log: qLog, build: qBuild, course: qCourse,
      give: qGive, take: qTake, exhibit: qExhibit, pitch: qPitch, show: qShow, eval: qEval }[q.kind];
    return f ? f(q) : shell(q, '<p class="sm-note">This quest is being built.</p>', doneBtn(q));
  }

  function qBeat(q) {
    var b = (q.beats || []).map(function (x) {
      if (x.cap) return '<div class="sm-cap">' + esc(x.cap) + '</div>';
      return '<div class="sm-xmit"><span>' + esc(x.who) + '</span>' + esc(x.t) + '</div>';
    }).join('');
    return shell(q, '<div class="sm-beats">' + b + '</div>', linkBtn(q) + doneBtn(q, 'Continue · +' + q.xc + ' XC'));
  }

  function qStudio(q) {
    var h = '<div class="sm-cards">';
    (q.options || []).forEach(function (o) {
      h += '<button class="sm-pick' + (S.studio === o.id ? ' on' : '') + '" data-studio="' + o.id + '" style="--c:' + o.accent + '">' +
        '<b>' + esc(o.name) + '</b><span>' + esc(o.line) + '</span></button>';
    });
    h += '</div>';
    return shell(q, h, doneBtn(q, 'Join this studio · +' + q.xc + ' XC', 'studio'));
  }

  function qTraits(q) {
    var h = '<p class="sm-note">Rate each statement from 1 (not me) to 5 (that is exactly me). Your top three become your character\'s core.</p><div class="sm-traits">';
    D.traits.forEach(function (t) {
      var v = S.traits[t.id] || 0;
      h += '<div class="sm-trait"><div class="sm-tq"><b>' + esc(t.name) + '</b><span>' + esc(t.q) + '</span></div><div class="sm-scale">';
      for (var i = 1; i <= 5; i++) h += '<button class="sm-s' + (v === i ? ' on' : '') + '" data-trait="' + t.id + '" data-val="' + i + '">' + i + '</button>';
      h += '</div></div>';
    });
    h += '</div>' + topTraitsHtml();
    return shell(q, h, doneBtn(q, 'Lock in my core · +' + q.xc + ' XC', 'traits'));
  }
  function topTraits() {
    return D.traits.map(function (t) { return { t: t, v: S.traits[t.id] || 0 }; })
      .filter(function (x) { return x.v > 0; })
      .sort(function (a, b) { return b.v - a.v; }).slice(0, 3);
  }
  function topTraitsHtml() {
    var top = topTraits();
    if (top.length < 3) return '<div class="sm-result dim" id="sm-top">Rate at least three statements to see your core.</div>';
    return '<div class="sm-result" id="sm-top"><span>Your core</span>' +
      top.map(function (x) { return '<b>' + esc(x.t.name) + '</b>'; }).join('') + '</div>';
  }

  function qForge(q) {
    var h = '<ol class="sm-steps">' + (q.steps || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    h += topTraitsHtml();
    h += fld('forge', 'Paste your character design prompt', S.forge, 'The Midjourney Prompt that Character Forge gave you', 6);
    return shell(q, h, linkBtn(q) + doneBtn(q, 'Save my prompt · +' + q.xc + ' XC', 'forge'));
  }

  function qCharProfile(q) {
    var p = S.hero || {};
    var h = '<div class="sm-grid2">' +
      fld('hero.name', 'Alter Ego name', p.name, 'The name on the card') +
      fld('hero.alias', 'Also known as', p.alias, 'Street name, handle, call sign') +
      fld('hero.origin', 'Where they are from', p.origin, 'City, station, world') +
      fld('hero.power', 'What they are unreasonably good at', p.power, 'One ability, stated plainly') +
      '</div>' +
      fld('hero.look', 'What they look like', p.look, 'Two or three sentences a reader could draw from', 3) +
      fld('hero.drive', 'What they want', p.drive, 'The thing they would stay up all night for', 2) +
      fld('hero.cost', 'What it costs them', p.cost, 'Every real character pays for their gift', 2) +
      fld('hero.gear', 'Gear and tools', p.gear, 'Three things they always have on them', 2) +
      fld('hero.image', 'Image link', p.image, 'Paste the link to your character image');
    var prev = p.name ? '<div class="sm-heroprev"><b>' + esc(p.name) + '</b>' +
      (p.alias ? '<i>“' + esc(p.alias) + '”</i>' : '') +
      (p.power ? '<span>' + esc(p.power) + '</span>' : '') + '</div>' : '';
    return shell(q, prev + h, doneBtn(q, 'Save my character · +' + q.xc + ' XC', 'hero'));
  }

  function qBoard(q) {
    var b = S.brand || {}, cols = b.colors || ['#00f0ff', '#ffd700', '#ff00ff', '#0a0f1e', '#ffffff'];
    var h = '<div class="sm-grid2">' +
      fld('brand.name', 'Brand name', b.name, 'Memorable, easy to say, easy to spell') +
      fld('brand.slogan', 'Slogan or tagline', b.slogan, 'Three to five syllables if you can') + '</div>';
    h += fld('brand.vision', 'Vision statement', b.vision, 'What the world looks like if your brand wins', 3);
    h += '<div class="sm-sub">Colour palette</div><div class="sm-cols">';
    cols.forEach(function (c, i) {
      h += '<label class="sm-col"><input type="color" data-col="' + i + '" value="' + esc(c) + '">' +
           '<span>' + esc(c) + '</span></label>';
    });
    h += '</div>';
    h += '<div class="sm-grid2">' +
      fld('brand.fontH', 'Headline font', b.fontH, 'Orbitron, Bangers, Anton...') +
      fld('brand.fontB', 'Body font', b.fontB, 'Inter, Rajdhani, Source Sans...') + '</div>';
    h += '<div class="sm-grid2">' +
      fld('brand.logoColor', 'Logo link — colour version', b.logoColor, 'Paste a link') +
      fld('brand.logoWhite', 'Logo link — white version', b.logoWhite, 'Paste a link') + '</div>';
    h += fld('brand.logoBlack', 'Logo link — black version', b.logoBlack, 'Paste a link');
    h += brandPrev(b, cols);
    return shell(q, h, linkBtn(q) + doneBtn(q, 'Save my Brand Board · +' + q.xc + ' XC', 'brand'));
  }
  function brandPrev(b, cols) {
    if (!b.name) return '';
    return '<div class="sm-brandprev" id="sm-bp"><div class="sm-bpname" style="font-family:' +
      esc(b.fontH || 'Orbitron') + ',sans-serif">' + esc(b.name) + '</div>' +
      (b.slogan ? '<div class="sm-bpslo">' + esc(b.slogan) + '</div>' : '') +
      '<div class="sm-bpcols">' + cols.map(function (c) {
        return '<i style="background:' + esc(c) + '"></i>'; }).join('') + '</div></div>';
  }

  function qMint(q) {
    var p = S.hero || {}, b = S.brand || {}, top = topTraits();
    var h = '<div class="sm-card-mint" style="--c:' + q.act.accent + '">' +
      '<div class="sm-mint-k">Prototype FLX · Nexus Ring · Seat Nine</div>' +
      '<div class="sm-mint-n">' + esc(p.name || pname()) + '</div>' +
      (p.alias ? '<div class="sm-mint-a">“' + esc(p.alias) + '”</div>' : '') +
      '<div class="sm-mint-row"><span>Studio</span><b>' + esc(S.studio ? studioName(S.studio) : 'Unassigned') + '</b></div>' +
      '<div class="sm-mint-row"><span>Brand</span><b>' + esc(b.name || '—') + '</b></div>' +
      '<div class="sm-mint-row"><span>Core</span><b>' + (top.length ? top.map(function (x) { return esc(x.t.name); }).join(' · ') : '—') + '</b></div>' +
      '<div class="sm-mint-row"><span>Ability</span><b>' + esc(p.power || '—') + '</b></div>' +
      (b.slogan ? '<div class="sm-mint-slo">' + esc(b.slogan) + '</div>' : '') +
      '</div>';
    h += '<div class="sm-beats"><div class="sm-xmit"><span>TESSERA</span>YOU ARE IN THE RING. NOW PICK SOMEBODY WORTH THE SEAT.</div></div>';
    return shell(q, h, doneBtn(q, 'Take the seat · +' + q.xc + ' XC'));
  }

  /* ── Act Two: the client work ───────────────────────────────────────── */
  function qPick(q) {
    if (!CL) return shell(q, '<p class="sm-note">Client files are loading.</p>', '');
    var h = '<div class="sm-clients">';
    CL.clients.forEach(function (c) {
      h += '<button class="sm-client' + (S.client === c.key ? ' on' : '') + '" data-client="' + esc(c.key) + '">' +
        '<span class="sm-cart" style="background-image:url(' + artUrl(c.art) + ')"></span>' +
        '<span class="sm-cbody"><b>' + esc(c.name) + '</b>' +
        '<i>' + esc(c.place) + ' · ' + esc(c.studio) + '</i>' +
        '<span>' + esc(c.tagline) + '</span></span></button>';
    });
    h += '</div>';
    return shell(q, h, doneBtn(q, 'Take this client · +' + q.xc + ' XC', 'client'));
  }

  function qInterview(q) {
    var c = client();
    if (!c) return shell(q, '<p class="sm-note">Choose a client first.</p>', '');
    var asked = S.iv.asked || [];
    var h = '<div class="sm-iv" style="--c:' + q.act.accent + '">';
    h += '<div class="sm-ivhead"><span class="sm-ivart" style="background-image:url(' + artUrl(c.art) + ')"></span>' +
      '<div><b>' + esc(c.name) + '</b><i>' + esc(c.role) + ' · ' + esc(c.place) + '</i></div></div>';
    h += '<div class="sm-thread" id="sm-thread">';
    h += '<div class="sm-them">' + esc(c.greeting) + '</div>';
    asked.forEach(function (qid) {
      var qq = c.questions.filter(function (x) { return x.id === qid; })[0];
      if (!qq) return;
      h += '<div class="sm-you">' + esc(qq.ask) + '</div>';
      h += '<div class="sm-them">' + esc(qq.answer) +
        '<em class="sm-reveal ' + esc(qq.reveals) + '">' + esc(qq.reveals.toUpperCase()) + ' · ' + esc(qq.clue) + '</em></div>';
    });
    h += '</div>';
    var left = c.questions.filter(function (x) { return asked.indexOf(x.id) < 0; });
    if (left.length) {
      h += '<div class="sm-asks">' + left.map(function (x) {
        return '<button class="sm-ask" data-ask="' + esc(x.id) + '">' + esc(x.ask) + '</button>'; }).join('') + '</div>';
    } else {
      h += '<div class="sm-result"><span>Interview complete</span><b>' + asked.length + ' clues collected</b></div>';
      h += '<div class="sm-cap">' + esc(c.problem_hint) + '</div>';
    }
    h += '<div class="sm-ivprog">' + asked.length + ' of ' + c.questions.length + ' questions asked</div>';
    h += '</div>';
    var foot = asked.length >= c.questions.length
      ? doneBtn(q, 'Take the clues to the Empathy Map · +' + q.xc + ' XC')
      : '<span class="sm-hint">Ask every question to finish the interview.</span>';
    return shell(q, h, foot);
  }

  function qCProfile(q) {
    var c = client(), p = S.cprofile || {};
    if (!c) return shell(q, '<p class="sm-note">Choose a client first.</p>', '');
    var h = '<div class="sm-cap">Write this so a teammate who has not met ' + esc(c.name.split(' ')[0]) +
            ' could brief somebody else on them.</div>';
    h += '<div class="sm-grid2">' +
      fld('cprofile.who', 'Who they are', p.who, 'One line') +
      fld('cprofile.where', 'Where they work', p.where, c.place) + '</div>';
    h += fld('cprofile.day', 'A normal day', p.day, 'What actually happens between waking up and going to bed', 3);
    h += fld('cprofile.goal', 'What they are trying to do', p.goal, '', 2);
    h += fld('cprofile.block', 'What is standing in the way', p.block, '', 2);
    h += fld('cprofile.tried', 'What they have already tried', p.tried, 'And why it did not hold', 2);
    h += fld('cprofile.win', 'What a win looks like to them', p.win, 'In their words, not yours', 2);
    return shell(q, h, linkBtn(q) + doneBtn(q, 'Save the profile · +' + q.xc + ' XC', 'cprofile'));
  }

  var QUAD = [['says', 'Says', 'What they say out loud'], ['thinks', 'Thinks', 'What they will not say'],
              ['does', 'Does', 'What they actually do'], ['feels', 'Feels', 'What it does to them']];
  function qEmpathy(q) {
    var c = client();
    if (!c) return shell(q, '<p class="sm-note">Choose a client first.</p>', '');
    var used = {};
    QUAD.forEach(function (k) { (S.emp[k[0]] || []).forEach(function (t) { used[t] = k[0]; }); });
    var pool = (S.iv.asked || []).map(function (qid) {
      return c.questions.filter(function (x) { return x.id === qid; })[0];
    }).filter(Boolean).filter(function (x) { return !used[x.clue]; });

    var h = '<div class="sm-emwrap">';
    h += '<div class="sm-empool"><div class="sm-sub">Clues from the interview</div>' +
      (pool.length ? pool.map(function (x) {
        return '<div class="sm-clue ' + esc(x.reveals) + '" draggable="true" data-clue="' + esc(x.clue) +
          '" data-rev="' + esc(x.reveals) + '">' + esc(x.clue) +
          '<i class="sm-cluego" data-put="' + esc(x.reveals) + '" data-clue="' + esc(x.clue) + '">→ ' + esc(x.reveals) + '</i></div>';
      }).join('') : '<div class="sm-hint">Every clue is placed.</div>') + '</div>';
    h += '<div class="sm-emgrid">';
    QUAD.forEach(function (k) {
      h += '<div class="sm-quad ' + k[0] + '" data-quad="' + k[0] + '"><b>' + k[1] + '</b><i>' + k[2] + '</i>' +
        '<div class="sm-qitems">' + (S.emp[k[0]] || []).map(function (t) {
          return '<span class="sm-chip">' + esc(t) + '<button data-rm="' + esc(k[0]) + '" data-t="' + esc(t) + '">×</button></span>';
        }).join('') + '</div>' +
        '<input class="sm-qadd" data-add="' + k[0] + '" placeholder="Add your own..."></div>';
    });
    h += '<div class="sm-emcenter" style="background-image:url(' + artUrl(c.art) + ')"><span>' + esc(c.name) + '</span></div>';
    h += '</div></div>';
    h += '<div class="sm-sub">Problem Statement</div>';
    h += '<div class="sm-cap">' + esc(c.problem_hint) + '</div>';
    h += fld('emp.problem', c.name.split(' ')[0] + ' needs a way to ... because ...', S.emp.problem,
             'One sentence. Need, then insight. No solution in it.', 3);
    var n = QUAD.reduce(function (a, k) { return a + (S.emp[k[0]] || []).length; }, 0);
    var full = QUAD.every(function (k) { return (S.emp[k[0]] || []).length >= 2; }) && (S.emp.problem || '').length > 25;
    h += '<div class="sm-result' + (full ? '' : ' dim') + '"><span>' + n + ' items placed</span><b>' +
      (full ? 'Map complete' : 'Needs 2+ in every quadrant and a problem statement') + '</b></div>';
    return shell(q, h, linkBtn(q) + doneBtn(q, 'Lock the map · +' + q.xc + ' XC', 'emp') +
      (full ? '' : '<span class="sm-hint">Two or more in every quadrant, plus the statement.</span>'));
  }

  function qSubmit(q) {
    var s = S.subs[q.id] || {};
    var h = '<div class="sm-cap">Submit in Google Classroom, then log it here so your host can see it landed.</div>';
    h += fld('subs.' + q.id + '.link', 'Link to your submission', s.link, 'Paste the Classroom or Canva link');
    h += fld('subs.' + q.id + '.note', 'Anything your host should know', s.note, '', 2);
    return shell(q, h, doneBtn(q, 'Log the submission · +' + q.xc + ' XC', 'sub:' + q.id));
  }

  /* ── Act Three: SparkLab ────────────────────────────────────────────── */
  function qSpark1(q) {
    var h = '<div class="sm-cap">Round One is the worst-possible-idea round. Look at your Empathy Map and write three solutions that would make it worse. Be specific. Terrible ideas are easier to flip than vague good ones.</div>';
    for (var i = 0; i < 3; i++) h += fld('spark.r1.' + i, 'Terrible idea ' + (i + 1), S.spark.r1[i], '', 2);
    return shell(q, h, linkBtn(q) + doneBtn(q, 'Log Round One · +' + q.xc + ' XC', 'r1'));
  }
  function qSpark2(q) {
    var h = '<div class="sm-cap">Flip each one. Take what makes the bad idea bad and invert it. ThinkTable AI can help you push each flip further.</div>';
    for (var i = 0; i < 3; i++) {
      h += '<div class="sm-flip"><div class="sm-bad">' + esc(S.spark.r1[i] || 'Idea ' + (i + 1)) + '</div>' +
        fld('spark.r2.' + i, 'Flipped into', S.spark.r2[i], '', 2) + '</div>';
    }
    return shell(q, h, linkBtn(q) + doneBtn(q, 'Log Round Two · +' + q.xc + ' XC', 'r2'));
  }
  function qSpark3(q) {
    var h = '<div class="sm-cap">Draw concept art for each flipped idea on paper. Photograph it in good light, crop it, brighten it until it reads as digital, then add it to your Ideation Development Form.</div>';
    h += fld('spark.r3', 'Link to your concept art', S.spark.r3, 'Paste the link to your photos or form', 2);
    return shell(q, h, '<a class="sm-btn out" target="_blank" rel="noopener" href="' + esc(D.canva.ideationForm) +
      '">Open the Ideation Development Form ↗</a>' + doneBtn(q, 'Log Round Three · +' + q.xc + ' XC', 'r3'));
  }
  function qMerge(q) {
    var h = '<div class="sm-cap">Merge all three flipped ideas into one. Then generate an overview and three different views — top-down, side, interior — enough that somebody could build from it.</div>';
    h += fld('spark.merged', 'The combined idea, in your words', S.spark.merged, '', 4);
    for (var i = 0; i < 4; i++) {
      h += fld('spark.views.' + i, ['Overview image link', 'View 2 link', 'View 3 link', 'View 4 link'][i],
        (S.spark.views || [])[i], '', 0);
    }
    return shell(q, h, doneBtn(q, 'Log the combined concept · +' + q.xc + ' XC', 'merge'));
  }

  /* ── Act Four: the workshop ─────────────────────────────────────────── */
  function qLogStart(q) {
    var e = (S.log || [])[0] || {};
    var h = '<div class="sm-cap">Entry one. Photograph the starting state of your project exactly as it is, then say what you intend to do today.</div>';
    h += fld('log.0.img', 'Image of the starting state', e.img, 'Paste a link to the photo or screenshot');
    h += fld('log.0.state', 'What the starting state actually is', e.state, '', 3);
    h += fld('log.0.goal', 'Goals for today', e.goal, '', 2);
    return shell(q, h, doneBtn(q, 'Open the log · +' + q.xc + ' XC', 'log0'));
  }
  function qLog(q) {
    var h = '<div class="sm-cap">One entry per working session. This log is what Checkpoint Prototype is graded on, so write it while you are still in the room.</div>';
    h += '<div class="sm-logs">' + (S.log || []).map(function (e, i) {
      return '<div class="sm-logrow"><b>Entry ' + (i + 1) + '</b>' +
        '<span>' + esc((e.state || '').slice(0, 110) || 'no starting state') + '</span>' +
        '<i>' + esc((e.end || '').slice(0, 110) || 'in progress') + '</i></div>';
    }).join('') + '</div>';
    var n = (S.log || []).length;
    h += '<div class="sm-sub">New entry ' + (n + 1) + '</div>';
    h += fld('log.' + n + '.img', 'Starting state image', '', 'Link');
    h += fld('log.' + n + '.state', 'Starting state', '', '', 2);
    h += fld('log.' + n + '.goal', 'Goals for today', '', '', 2);
    h += fld('log.' + n + '.endimg', 'Ending state image', '', 'Link');
    h += fld('log.' + n + '.end', 'Ending state', '', '', 2);
    h += fld('log.' + n + '.next', 'Goals for next session', '', '', 2);
    return shell(q, h, linkBtn(q) +
      '<button class="sm-btn go" data-logadd="' + q.id + '">Add entry · +' + q.xc + ' XC</button>');
  }
  function qBuild(q) {
    var b = S.exhibit || {};
    var h = '<div class="sm-cap">Build it. ProtoDev AI is a guide, not a pair of hands — ask it what to try next, not what to type.</div>';
    h += fld('exhibit.buildLink', 'Link to the prototype', b.buildLink, 'Wherever it lives');
    h += fld('exhibit.buildNote', 'What works and what does not yet', b.buildNote, '', 3);
    return shell(q, h, doneBtn(q, 'Mark the prototype built · +' + q.xc + ' XC', 'build'));
  }

  /* ── Act Five: feedforward ──────────────────────────────────────────── */
  var FF = [
    { q: "A tester says: 'the colours are ugly.' Which reply is feedforward?",
      a: ["Tell them they are wrong.", "Next version, try two colours instead of five and test it on a phone.", "Write down that they hated it."], c: 1 },
    { q: "What is the difference between feedback and feedforward?",
      a: ["Feedback is about the past, feedforward is about the next move.", "Feedforward is nicer.", "There is no difference."], c: 0 },
    { q: "Someone tests your prototype and gets lost on screen two. Best feedforward to give them?",
      a: ["Screen two is confusing.", "On screen two, put the back button where their thumb already is, then retest with one person.", "You should redesign the whole thing."], c: 1 },
    { q: "You receive three notes you disagree with. What do you do?",
      a: ["Ignore them, they do not get it.", "Change everything immediately.", "Say out loud which one you are acting on and why, and which you are parking and why."], c: 2 },
    { q: "Good feedforward is...",
      a: ["Specific, doable before the next test, and about the work.", "Positive at all times.", "Delivered by the host only."], c: 0 }
  ];
  function qCourse(q) {
    var f = S.feed || {};
    var h = '<div class="sm-cap">Feedback tells you what already went wrong. Feedforward tells you what to do next. The Beta Testers\' Network runs on the second one.</div>';
    h += '<div class="sm-quiz">';
    FF.forEach(function (item, i) {
      var pickd = (f.quiz || {})[i];
      h += '<div class="sm-qz"><b>' + esc(item.q) + '</b>';
      item.a.forEach(function (a, j) {
        var on = pickd === j, right = on && j === item.c, wrong = on && j !== item.c;
        h += '<button class="sm-qa' + (right ? ' right' : '') + (wrong ? ' wrong' : '') +
          '" data-qz="' + i + '" data-qa="' + j + '">' + esc(a) + '</button>';
      });
      h += '</div>';
    });
    h += '</div>';
    h += fld('feed.learned', 'In one sentence: what will you do differently when you give notes?', f.learned, '', 2);
    var score = FF.filter(function (it, i) { return (f.quiz || {})[i] === it.c; }).length;
    h += '<div class="sm-result' + (score === FF.length ? '' : ' dim') + '"><span>' + score + ' of ' + FF.length + ' correct</span><b>' +
      (score === FF.length ? 'Certified' : 'Keep going') + '</b></div>';
    return shell(q, h, score === FF.length
      ? doneBtn(q, 'Take the certificate · +' + q.xc + ' XC', 'feed')
      : '<span class="sm-hint">Get all five right to certify.</span>');
  }
  function qGive(q) {
    var f = S.feed || {}, g = f.gave || [];
    var h = '<div class="sm-cap">Test two other teams\' prototypes. For each one, give three moves they can make before the next test. Specific, doable, about the work.</div>';
    for (var t = 0; t < 2; t++) {
      h += '<div class="sm-sub">Team ' + (t + 1) + '</div>';
      h += fld('feed.gave.' + t + '.team', 'Whose prototype', (g[t] || {}).team, '');
      for (var i = 1; i <= 3; i++) h += fld('feed.gave.' + t + '.m' + i, 'Move ' + i, (g[t] || {})['m' + i], '', 2);
    }
    return shell(q, h, doneBtn(q, 'Log what you gave · +' + q.xc + ' XC', 'gave'));
  }
  function qTake(q) {
    var f = S.feed || {}, tk = f.took || [];
    var h = '<div class="sm-cap">Now the other direction. Write down what came back at you, then say out loud what you are changing and what you are parking.</div>';
    for (var i = 0; i < 3; i++) h += fld('feed.took.' + i, 'Note ' + (i + 1) + ' you received', tk[i], '', 2);
    h += fld('feed.change', 'What you are changing, and what you are parking on purpose', f.change, '', 3);
    return shell(q, h, doneBtn(q, 'Log what you took · +' + q.xc + ' XC', 'took'));
  }

  /* ── Act Six: exhibit ───────────────────────────────────────────────── */
  function qExhibit(q) {
    var x = S.exhibit || {};
    var h = '<div class="sm-cap">A stranger walks past your booth. You have four seconds. Design for those four seconds first, then everything else.</div>';
    h += fld('exhibit.hook', 'The four-second hook', x.hook, 'What they see, read or hear first', 2);
    h += fld('exhibit.layout', 'Booth layout', x.layout, 'Where the screen, the artefact and you are standing', 3);
    h += fld('exhibit.demo', 'What visitors get to touch', x.demo, '', 2);
    h += fld('exhibit.proof', 'Your proof', x.proof, 'The evidence it works — test results, a user quote, a number', 2);
    return shell(q, h, doneBtn(q, 'Save the exhibit design · +' + q.xc + ' XC', 'exh'));
  }
  function qPitch(q) {
    var p = S.pitch || {};
    var h = '<div class="sm-cap">Ninety seconds. Five beats. Say them in this order and do not add a sixth.</div>';
    h += fld('pitch.client', '1. Who your client is', p.client, '', 2);
    h += fld('pitch.problem', '2. The problem, in their words', p.problem, '', 2);
    h += fld('pitch.solution', '3. What you built', p.solution, '', 2);
    h += fld('pitch.proof', '4. Why you know it works', p.proof, '', 2);
    h += fld('pitch.ask', '5. What you want from the room', p.ask, '', 2);
    var words = ['client', 'problem', 'solution', 'proof', 'ask'].reduce(function (a, k) {
      return a + String(p[k] || '').split(/\s+/).filter(Boolean).length; }, 0);
    h += '<div class="sm-result' + (words >= 90 && words <= 230 ? '' : ' dim') + '"><span>' + words +
      ' words</span><b>' + (words < 90 ? 'Too thin for 90 seconds' : (words > 230 ? 'Too long — cut it' : 'About 90 seconds')) + '</b></div>';
    return shell(q, h, doneBtn(q, 'Save the pitch · +' + q.xc + ' XC', 'pitch'));
  }
  function qShow(q) {
    var h = '<div class="sm-beats"><div class="sm-xmit"><span>TESSERA</span>THE RING IS WATCHING. GO.</div></div>';
    h += '<div class="sm-cap">The Exhibit is live. Your host runs it on X-Live — your booth, your pitch, your prototype, in front of people who did not watch you build it.</div>';
    h += '<button class="sm-btn out" data-xlive="1">Open X-Live ↗</button>';
    h += fld('exhibit.showNote', 'What happened', (S.exhibit || {}).showNote, 'Write it down while it is fresh', 3);
    return shell(q, h, doneBtn(q, 'Season complete · +' + q.xc + ' XC', 'show'));
  }
  function qEval(q) {
    var e = S.evalr || {};
    var h = '<div class="sm-cap">Last quest. Be honest — this is the one that makes next season better.</div>';
    h += fld('evalr.proud', 'What you are proudest of', e.proud, '', 2);
    h += fld('evalr.again', 'What you would do differently', e.again, '', 2);
    h += fld('evalr.learned', 'The thing you learned that you did not expect', e.learned, '', 2);
    h += fld('evalr.next', 'What you are taking into next season', e.next, '', 2);
    return shell(q, h, doneBtn(q, 'Close the season · +' + q.xc + ' XC', 'eval'));
  }

  /* ── setters ────────────────────────────────────────────────────────── */
  function setPath(path, val) {
    var parts = path.split('.'), o = S;
    for (var i = 0; i < parts.length - 1; i++) {
      var k = parts[i], nx = parts[i + 1];
      if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(nx) ? [] : {};
      o = o[k];
    }
    o[parts[parts.length - 1]] = val;
  }

  /* ── events ─────────────────────────────────────────────────────────── */
  function wire(el) {
    el.querySelectorAll('[data-q]').forEach(function (b) {
      b.onclick = function () { go('quest', b.getAttribute('data-q')); };
    });
    var bk = el.querySelector('[data-back]'); if (bk) bk.onclick = function () { go('map'); };

    el.querySelectorAll('[data-studio]').forEach(function (b) {
      b.onclick = function () { S.studio = b.getAttribute('data-studio'); save(); render(); };
    });
    el.querySelectorAll('[data-trait]').forEach(function (b) {
      b.onclick = function () {
        S.traits[b.getAttribute('data-trait')] = parseInt(b.getAttribute('data-val'), 10);
        save();
        b.parentElement.querySelectorAll('.sm-s').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        var t = document.getElementById('sm-top');
        if (t) t.outerHTML = topTraitsHtml();
      };
    });
    el.querySelectorAll('[data-client]').forEach(function (b) {
      b.onclick = function () { S.client = b.getAttribute('data-client'); save(); render(); };
    });
    el.querySelectorAll('[data-ask]').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-ask');
        if ((S.iv.asked || []).indexOf(id) < 0) S.iv.asked.push(id);
        save(); render();
        var th = document.getElementById('sm-thread');
        if (th) th.scrollTop = th.scrollHeight;
      };
    });
    el.querySelectorAll('[data-put]').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var k = b.getAttribute('data-put'), t = b.getAttribute('data-clue');
        if ((S.emp[k] || []).indexOf(t) < 0) S.emp[k].push(t);
        save(); render();
      };
    });
    el.querySelectorAll('[data-rm]').forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-rm'), t = b.getAttribute('data-t');
        S.emp[k] = (S.emp[k] || []).filter(function (x) { return x !== t; });
        save(); render();
      };
    });
    el.querySelectorAll('[data-add]').forEach(function (i) {
      i.onkeydown = function (e) {
        if (e.key !== 'Enter' || !i.value.trim()) return;
        var k = i.getAttribute('data-add');
        S.emp[k].push(i.value.trim()); i.value = ''; save(); render();
      };
    });
    el.querySelectorAll('.sm-quad').forEach(function (z) {
      z.addEventListener('dragover', function (e) { e.preventDefault(); z.classList.add('over'); });
      z.addEventListener('dragleave', function () { z.classList.remove('over'); });
      z.addEventListener('drop', function (e) {
        e.preventDefault(); z.classList.remove('over');
        var t = e.dataTransfer.getData('text/plain'); if (!t) return;
        var k = z.getAttribute('data-quad');
        if ((S.emp[k] || []).indexOf(t) < 0) S.emp[k].push(t);
        save(); render();
      });
    });
    el.querySelectorAll('.sm-clue').forEach(function (c) {
      c.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', c.getAttribute('data-clue'));
      });
    });
    el.querySelectorAll('[data-qz]').forEach(function (b) {
      b.onclick = function () {
        S.feed.quiz = S.feed.quiz || {};
        S.feed.quiz[parseInt(b.getAttribute('data-qz'), 10)] = parseInt(b.getAttribute('data-qa'), 10);
        save(); render();
      };
    });
    el.querySelectorAll('[data-k]').forEach(function (i) {
      i.onchange = i.onblur = function () { setPath(i.getAttribute('data-k'), i.value); save(); };
    });
    el.querySelectorAll('[data-col]').forEach(function (i) {
      i.onchange = function () {
        S.brand.colors = S.brand.colors || ['#00f0ff', '#ffd700', '#ff00ff', '#0a0f1e', '#ffffff'];
        S.brand.colors[parseInt(i.getAttribute('data-col'), 10)] = i.value;
        save(); render();
      };
    });
    var xl = el.querySelector('[data-xlive]');
    if (xl) xl.onclick = function () { try { window.navigateTo('lite'); } catch (e) {} };

    var la = el.querySelector('[data-logadd]');
    if (la) la.onclick = function () {
      var q = QUESTS[la.getAttribute('data-logadd')];
      var n = (S.log || []).length;
      var e = S.log[n] || {};
      if (!e.state && !e.end) { toast('Write at least a starting state.', '239,68,68'); return; }
      S.done[q.id] = new Date().toISOString();
      award(q.xc, q.xp, 'Story Mode: log entry ' + (n + 1));
      save(); toast('+' + q.xc + ' X-Coin · entry ' + (n + 1) + ' logged', q.act.accent); render();
    };

    el.querySelectorAll('[data-done]').forEach(function (b) {
      b.onclick = function () {
        var q = QUESTS[b.getAttribute('data-done')], g = b.getAttribute('data-guard');
        if (!guard(g, q)) return;
        var was = isDone(q.id);
        complete(q);
        if (!was) go('map'); else { toast('Saved.', q.act.accent); render(); }
      };
    });
  }

  function guard(g, q) {
    if (!g) return true;
    var bad = function (m) { toast(m, '239,68,68'); return false; };
    if (g === 'studio' && !S.studio) return bad('Pick a studio first.');
    if (g === 'traits' && topTraits().length < 3) return bad('Rate at least three statements.');
    if (g === 'forge' && !(S.forge || '').trim()) return bad('Paste your character prompt first.');
    if (g === 'hero' && !(S.hero.name || '').trim()) return bad('Your Alter Ego needs a name.');
    if (g === 'brand' && !(S.brand.name || '').trim()) return bad('Your brand needs a name.');
    if (g === 'client' && !S.client) return bad('Choose a client first.');
    if (g === 'cprofile' && !(S.cprofile.day || '').trim()) return bad('Describe a normal day for your client.');
    if (g === 'emp') {
      var thin = QUAD.filter(function (k) { return (S.emp[k[0]] || []).length < 2; });
      if (thin.length) return bad('Needs two or more in ' + thin.map(function (k) { return k[1]; }).join(', ') + '.');
      if ((S.emp.problem || '').length < 25) return bad('Write a full problem statement.');
    }
    if (g === 'r1' && S.spark.r1.filter(function (x) { return (x || '').trim(); }).length < 3) return bad('Three terrible ideas, please.');
    if (g === 'r2' && S.spark.r2.filter(function (x) { return (x || '').trim(); }).length < 3) return bad('Flip all three.');
    if (g === 'r3' && !(S.spark.r3 || '').trim()) return bad('Add the link to your concept art.');
    if (g === 'merge' && !(S.spark.merged || '').trim()) return bad('Describe the combined idea.');
    if (g === 'log0' && !((S.log[0] || {}).state || '').trim()) return bad('Write the starting state.');
    if (g === 'build' && !((S.exhibit || {}).buildLink || '').trim()) return bad('Link the prototype.');
    if (g === 'feed' && !(S.feed.learned || '').trim()) return bad('Write your one sentence.');
    if (g === 'gave' && !(((S.feed.gave || [])[0] || {}).m1 || '').trim()) return bad('Give at least one move.');
    if (g === 'took' && !(S.feed.change || '').trim()) return bad('Say what you are changing.');
    if (g === 'exh' && !((S.exhibit || {}).hook || '').trim()) return bad('Write the four-second hook.');
    if (g === 'pitch' && !((S.pitch || {}).problem || '').trim()) return bad('The pitch needs a problem.');
    if (g === 'show' && !((S.exhibit || {}).showNote || '').trim()) return bad('Write what happened.');
    if (g === 'eval' && !((S.evalr || {}).proud || '').trim()) return bad('Answer at least the first question.');
    if (g && g.indexOf('sub:') === 0 && !((S.subs[g.slice(4)] || {}).link || '').trim()) return bad('Paste the submission link.');
    return true;
  }

  /* ── boot ───────────────────────────────────────────────────────────── */
  window.pflxStoryBoot = function () {
    load();
    render();
  };
  if (document.getElementById('sm-root')) window.pflxStoryBoot();
})();
