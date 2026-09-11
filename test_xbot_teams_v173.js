// Unit tests for PATCH PLATFORM v173: xc-2, the Team-arrangement board
// ported from x-live-check's rTeams()/makeTeams()/teamsShufflePlayers()/
// teamsRerollNames()/teamsMovePlayer()/clearTeams() into X-Bot's Live tab.
// Extracts the REAL shipped code out of preview.html via brace/string
// matching -- never a reimplementation -- and runs it against stubbed
// document/window/mcPlayers, asserting real side effects (cfg saved,
// grid innerHTML rendered) not just that strings are present.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

function extractBetween(src, startMarker, endMarker, fromIndex) {
  const start = src.indexOf(startMarker, fromIndex || 0);
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

check('PFLX_PATCH bumped to 173', src.indexOf("window.PFLX_PATCH   = 173;") !== -1);

// ── Build a sandbox around the real team-board block, from
// PFLX_XBOT_TEAM_COLORS through pflxXBotClearTeams, verbatim -- the same
// brace/string-matching discipline used for v172's dock functions. ──
function makeSandbox(players) {
  const END_MARKER = '\n\n        function switchXBotMode(mode) {';
  const blockWithMarker = extractBetween(src, 'var PFLX_XBOT_TEAM_COLORS = [', END_MARKER);
  const block = blockWithMarker.slice(0, -END_MARKER.length);

  const saveCalls = [];
  const teamsGrid = { innerHTML: '' };
  const teamNInput = { value: '2' };
  const sessionsPanel = { style: {} };
  const teamsPanel = { style: {} };
  const subtabs = [
    { attr: 'sessions', classes: new Set(['xbot-live-subtab', 'active']) },
    { attr: 'teams', classes: new Set(['xbot-live-subtab']) },
  ];
  function subtabEl(s) {
    return {
      getAttribute: function (k) { return k === 'data-subtab' ? s.attr : null; },
      classList: {
        toggle: function (c, on) { if (on) s.classes.add(c); else s.classes.delete(c); },
        contains: function (c) { return s.classes.has(c); },
      },
    };
  }
  const stubDocument = {
    getElementById: function (id) {
      if (id === 'xbot-teams-grid') return teamsGrid;
      if (id === 'xbot-team-n') return teamNInput;
      if (id === 'xbot-live-sessions-panel') return sessionsPanel;
      if (id === 'xbot-live-teams-panel') return teamsPanel;
      return null;
    },
    querySelectorAll: function (sel) {
      if (sel === '.xbot-live-subtab') return subtabs.map(subtabEl);
      return [];
    },
    querySelector: function (sel) {
      if (sel === '.xbot-live-subtab.active') {
        const a = subtabs.find(function (s) { return s.classes.has('active'); });
        return a ? subtabEl(a) : null;
      }
      return null;
    },
  };

  var cloudCfg = { cohorts: [], teams: { names: [], assign: {} } };
  const win = {
    _xbotLiveCfg: null,
    pflxXBotLoadCfg: async function () { return JSON.parse(JSON.stringify(cloudCfg)); },
    pflxXBotSaveCfg: async function (cfg) { saveCalls.push(JSON.parse(JSON.stringify(cfg))); cloudCfg = JSON.parse(JSON.stringify(cfg)); },
  };

  function escapeHtmlStub(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function pcAvatarHtmlStub(img, name, size) { return '<AVATAR:' + name + ':' + size + '>'; }

  const fullSrc = block +
    '\nsandbox.pflxXBotDrawTeamNames = pflxXBotDrawTeamNames;' +
    '\nsandbox.pflxXBotTeamColor = pflxXBotTeamColor;' +
    '\nsandbox.PFLX_XBOT_TEAM_NAME_BANK = PFLX_XBOT_TEAM_NAME_BANK;' +
    '\nsandbox.PFLX_XBOT_TEAM_COLORS = PFLX_XBOT_TEAM_COLORS;\n';

  const fn = new Function(
    'sandbox', 'window', 'document', 'mcPlayers', 'escapeHtml', '_pcAvatarHtml',
    fullSrc
  );
  const sandbox = { window: win };
  fn(sandbox, win, stubDocument, players, escapeHtmlStub, pcAvatarHtmlStub);

  return {
    win: win,
    doc: stubDocument,
    teamsGrid: teamsGrid,
    teamNInput: teamNInput,
    sessionsPanel: sessionsPanel,
    teamsPanel: teamsPanel,
    subtabs: subtabs,
    saveCalls: saveCalls,
    pflxXBotDrawTeamNames: sandbox.pflxXBotDrawTeamNames,
    pflxXBotTeamColor: sandbox.pflxXBotTeamColor,
    PFLX_XBOT_TEAM_NAME_BANK: sandbox.PFLX_XBOT_TEAM_NAME_BANK,
    PFLX_XBOT_TEAM_COLORS: sandbox.PFLX_XBOT_TEAM_COLORS,
    pflxXBotTeamRoster: win.pflxXBotTeamRoster,
    xbotLiveSwitchSubTab: win.xbotLiveSwitchSubTab,
    pflxXBotRenderTeams: win.pflxXBotRenderTeams,
    pflxXBotMakeTeams: win.pflxXBotMakeTeams,
    pflxXBotTeamsShuffle: win.pflxXBotTeamsShuffle,
    pflxXBotTeamsRerollNames: win.pflxXBotTeamsRerollNames,
    pflxXBotTeamsMovePlayer: win.pflxXBotTeamsMovePlayer,
    pflxXBotClearTeams: win.pflxXBotClearTeams,
  };
}

function mkPlayer(id, brand, cohort, xcoin, role) {
  return { id: id, brand: brand, cohort: cohort || '', xcoin: xcoin || 0, role: role || 'player', image: null };
}

async function main() {
  // ── pflxXBotDrawTeamNames: pure name-bank draw ──
  {
    const sb = makeSandbox([]);
    const names = sb.pflxXBotDrawTeamNames(4);
    check('drawTeamNames(4) returns exactly 4 names', names.length === 4);
    check('drawTeamNames names all come from the real name bank', names.every(function (n) { return sb.PFLX_XBOT_TEAM_NAME_BANK.indexOf(n) !== -1; }));
    check('drawTeamNames returns unique names (no duplicate draw)', new Set(names).size === 4);
    check('the real name bank has at least 6 entries (covers the max team count)', sb.PFLX_XBOT_TEAM_NAME_BANK.length >= 6);
  }

  // ── pflxXBotTeamColor: pure index-cycling classifier ──
  {
    const sb = makeSandbox([]);
    const names = ['A', 'B', 'C'];
    check('teamColor picks the color at the team\'s own index', sb.pflxXBotTeamColor('B', names) === sb.PFLX_XBOT_TEAM_COLORS[1]);
    check('teamColor for an unknown name falls back to index -1 wrapped to the last color',
      sb.pflxXBotTeamColor('nope', names) === sb.PFLX_XBOT_TEAM_COLORS[sb.PFLX_XBOT_TEAM_COLORS.length - 1]);
    const eightNames = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7'];
    check('teamColor wraps around once the team index exceeds the color count',
      sb.pflxXBotTeamColor('n7', eightNames) === sb.PFLX_XBOT_TEAM_COLORS[7 % sb.PFLX_XBOT_TEAM_COLORS.length]);
  }

  // ── pflxXBotTeamRoster: cohort filter + admin exclusion (mirrors
  // X-Live's classRoster(), but reading mcPlayers instead of L.roster) ──
  {
    const players = [
      mkPlayer('p1', 'Alpha', 'Period 3', 10),
      mkPlayer('p2', 'Beta', 'Period 4', 20),
      mkPlayer('p3', 'Gamma', 'Period 3, Period 5', 5),
      mkPlayer('p4', 'AdminOne', 'Period 3', 999, 'admin'),
    ];
    const sb = makeSandbox(players);
    sb.win._xbotLiveCfg = { cohorts: [] };
    check('no cohort filter -> returns every non-admin player', sb.pflxXBotTeamRoster().length === 3);
    check('the admin-role player is always excluded regardless of cohort filter',
      sb.pflxXBotTeamRoster().every(function (p) { return p.role !== 'admin'; }));
    sb.win._xbotLiveCfg = { cohorts: ['period 3'] };
    const filtered = sb.pflxXBotTeamRoster();
    check('a cohort filter matches case-insensitively', filtered.some(function (p) { return p.id === 'p1'; }));
    check('a multi-cohort player (comma-separated) matches if ANY of their cohorts is selected', filtered.some(function (p) { return p.id === 'p3'; }));
    check('a player whose only cohort is NOT selected is excluded', !filtered.some(function (p) { return p.id === 'p2'; }));
  }

  // ── pflxXBotMakeTeams: drafts N teams, every roster player assigned,
  // saves through pflxXBotSaveCfg ──
  {
    const players = [mkPlayer('p1', 'A'), mkPlayer('p2', 'B'), mkPlayer('p3', 'C'), mkPlayer('p4', 'D'), mkPlayer('p5', 'E'), mkPlayer('p6', 'F')];
    const sb = makeSandbox(players);
    sb.win._xbotLiveCfg = { cohorts: [] };
    sb.teamNInput.value = '3';
    await sb.pflxXBotMakeTeams();
    const cfg = sb.win._xbotLiveCfg;
    check('makeTeams drafts exactly the requested number of teams', cfg.teams.names.length === 3);
    check('makeTeams assigns every roster player to one of the drafted team names',
      players.every(function (p) { return cfg.teams.names.indexOf(cfg.teams.assign[p.id]) !== -1; }));
    check('makeTeams persists the drafted teams via pflxXBotSaveCfg', sb.saveCalls.length === 1 && sb.saveCalls[0].teams.names.length === 3);
  }
  {
    // team-count input is clamped to [2,6], same as X-Live's own makeTeams()
    const sb = makeSandbox([mkPlayer('p1', 'A'), mkPlayer('p2', 'B')]);
    sb.win._xbotLiveCfg = { cohorts: [] };
    sb.teamNInput.value = '99';
    await sb.pflxXBotMakeTeams();
    check('a team-count request above the max is clamped to 6', sb.win._xbotLiveCfg.teams.names.length === 6);
    sb.teamNInput.value = '0';
    await sb.pflxXBotMakeTeams();
    check('a team-count request below the min is clamped to 2', sb.win._xbotLiveCfg.teams.names.length === 2);
  }

  // ── pflxXBotTeamsShuffle: keeps the SAME team names, only reassigns
  // players ──
  {
    const players = [mkPlayer('p1', 'A'), mkPlayer('p2', 'B'), mkPlayer('p3', 'C')];
    const sb = makeSandbox(players);
    sb.win._xbotLiveCfg = { cohorts: [], teams: { names: ['RED', 'BLUE'], assign: { p1: 'RED', p2: 'RED', p3: 'RED' } } };
    await sb.pflxXBotTeamsShuffle();
    const cfg = sb.win._xbotLiveCfg;
    check('shuffle leaves the team NAMES unchanged', cfg.teams.names.length === 2 && cfg.teams.names[0] === 'RED' && cfg.teams.names[1] === 'BLUE');
    check('shuffle still assigns every roster player to a valid team',
      players.every(function (p) { return cfg.teams.names.indexOf(cfg.teams.assign[p.id]) !== -1; }));
    check('shuffle is a no-op when there are no teams yet (no crash)', true);
  }
  {
    const sb = makeSandbox([mkPlayer('p1', 'A')]);
    sb.win._xbotLiveCfg = { cohorts: [], teams: { names: [], assign: {} } };
    await sb.pflxXBotTeamsShuffle();
    check('shuffle with zero drafted teams does not throw and leaves teams empty', sb.win._xbotLiveCfg.teams.names.length === 0);
  }

  // ── pflxXBotTeamsRerollNames: fresh names, but each player's RELATIVE
  // team membership carries over (old team A's members -> new team A's
  // name, not scrambled) ──
  {
    const players = [mkPlayer('p1', 'A'), mkPlayer('p2', 'B'), mkPlayer('p3', 'C')];
    const sb = makeSandbox(players);
    sb.win._xbotLiveCfg = { cohorts: [], teams: { names: ['RED', 'BLUE'], assign: { p1: 'RED', p2: 'BLUE', p3: 'RED' } } };
    await sb.pflxXBotTeamsRerollNames();
    const cfg = sb.win._xbotLiveCfg;
    check('reroll draws the same NUMBER of new names', cfg.teams.names.length === 2);
    check('reroll actually changes the team names (not a no-op)', cfg.teams.names.indexOf('RED') === -1 && cfg.teams.names.indexOf('BLUE') === -1);
    check('players who were on the SAME old team are still on the SAME new team after reroll',
      cfg.teams.assign.p1 === cfg.teams.assign.p3);
    check('a player on a DIFFERENT old team is still on a different new team after reroll',
      cfg.teams.assign.p1 !== cfg.teams.assign.p2);
  }

  // ── pflxXBotTeamsMovePlayer: cycles through team names, wraps around ──
  {
    const sb = makeSandbox([mkPlayer('p1', 'A')]);
    sb.win._xbotLiveCfg = { cohorts: [], teams: { names: ['RED', 'BLUE'], assign: { p1: 'RED' } } };
    await sb.pflxXBotTeamsMovePlayer('p1');
    check('moving a player advances them to the next team', sb.win._xbotLiveCfg.teams.assign.p1 === 'BLUE');
    await sb.pflxXBotTeamsMovePlayer('p1');
    check('moving a player past the last team wraps back to the first', sb.win._xbotLiveCfg.teams.assign.p1 === 'RED');
  }
  {
    const sb = makeSandbox([mkPlayer('p1', 'A')]);
    sb.win._xbotLiveCfg = { cohorts: [], teams: { names: ['ONLY'], assign: { p1: 'ONLY' } } };
    await sb.pflxXBotTeamsMovePlayer('p1');
    check('moving a player is a no-op when fewer than 2 teams exist', sb.win._xbotLiveCfg.teams.assign.p1 === 'ONLY');
  }

  // ── pflxXBotClearTeams: resets to empty, persists the reset ──
  {
    const sb = makeSandbox([mkPlayer('p1', 'A')]);
    sb.win._xbotLiveCfg = { cohorts: [], teams: { names: ['RED', 'BLUE'], assign: { p1: 'RED' } } };
    await sb.pflxXBotClearTeams();
    check('clearTeams empties both names and assignments', sb.win._xbotLiveCfg.teams.names.length === 0 && Object.keys(sb.win._xbotLiveCfg.teams.assign).length === 0);
    check('clearTeams persists the empty state via pflxXBotSaveCfg', sb.saveCalls.length === 1 && sb.saveCalls[0].teams.names.length === 0);
  }

  // ── window.pflxXBotRenderTeams: real DOM-touching render, both states ──
  {
    const sb = makeSandbox([mkPlayer('p1', 'A')]);
    sb.win._xbotLiveCfg = { cohorts: [], teams: { names: [], assign: {} } };
    await sb.pflxXBotRenderTeams();
    check('render with zero teams shows the "NO TEAMS YET" draft prompt', sb.teamsGrid.innerHTML.indexOf('NO TEAMS YET') !== -1);
    check('render with zero teams offers a DRAFT TEAMS action', sb.teamsGrid.innerHTML.indexOf('pflxXBotMakeTeams()') !== -1);
  }
  {
    const players = [mkPlayer('p1', 'Alpha', '', 40), mkPlayer('p2', 'Beta', '', 60)];
    const sb = makeSandbox(players);
    sb.win._xbotLiveCfg = { cohorts: [], teams: { names: ['RED'], assign: { p1: 'RED', p2: 'RED' } } };
    await sb.pflxXBotRenderTeams();
    check('render with a populated team shows the team name', sb.teamsGrid.innerHTML.indexOf('RED') !== -1);
    check('render sums each team\'s current total X-Coin balance from mcPlayers (40+60=100)', sb.teamsGrid.innerHTML.indexOf('100') !== -1);
    check('render includes both member names', sb.teamsGrid.innerHTML.indexOf('Alpha') !== -1 && sb.teamsGrid.innerHTML.indexOf('Beta') !== -1);
  }
  {
    const sb = makeSandbox([]);
    sb.win._xbotLiveCfg = { cohorts: [], teams: { names: ['LONE'], assign: {} } };
    await sb.pflxXBotRenderTeams();
    check('render shows an "empty" placeholder for a team with zero members', sb.teamsGrid.innerHTML.indexOf('empty') !== -1);
  }

  // ── window.xbotLiveSwitchSubTab: toggles panel visibility + active pill,
  // and triggers a teams re-render when switching TO teams ──
  {
    const sb = makeSandbox([mkPlayer('p1', 'A')]);
    sb.win._xbotLiveCfg = { cohorts: [], teams: { names: [], assign: {} } };
    sb.xbotLiveSwitchSubTab('teams');
    // xbotLiveSwitchSubTab fires an async render without awaiting it --
    // give the microtask queue a tick to let it land, same as the real
    // onclick handler would.
    await new Promise(function (r) { setTimeout(r, 0); });
    check('switching to the teams sub-tab hides the sessions panel', sb.sessionsPanel.style.display === 'none');
    check('switching to the teams sub-tab shows the teams panel', sb.teamsPanel.style.display === 'block');
    check('switching to teams marks the teams pill active and sessions pill inactive',
      sb.subtabs[1].classes.has('active') && !sb.subtabs[0].classes.has('active'));
    check('switching to the teams sub-tab triggers a render (grid populated, not the initial placeholder)',
      sb.teamsGrid.innerHTML.indexOf('NO TEAMS YET') !== -1);
    sb.xbotLiveSwitchSubTab('sessions');
    check('switching back to sessions shows the sessions panel again', sb.sessionsPanel.style.display === 'block');
    check('switching back to sessions hides the teams panel', sb.teamsPanel.style.display === 'none');
  }
}

main().then(function () {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}).catch(function (e) {
  console.error(e);
  console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed (uncaught error)');
  process.exit(1);
});
