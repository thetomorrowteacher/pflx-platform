// Unit tests for PATCH PLATFORM v169: xb-1, the X-Bot / X-Live session
// bridge. Extracts the REAL shipped pflxXBotMergeSession/
// pflxXBotMergeSessionList functions from preview.html via brace/string
// matching -- never a reimplementation -- and asserts the same
// read-merge-write guarantees pflx-persistence-guardrail requires: a stale
// write must never clobber a concurrent edit, liveParticipants/awardedTo/
// raceEvents must union (never shrink), and a terminal status always wins.
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

function extractBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
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

function makeSandbox() {
  const sandbox = {};
  const body = extractBetween(
    src,
    'function pflxXBotMergeSession(local, incoming) {',
    "return Object.keys(byId).map(function (k) { return byId[k]; });\n        }\n"
  );
  const full = body +
    '\nsandbox.pflxXBotMergeSession = pflxXBotMergeSession;' +
    '\nsandbox.pflxXBotMergeSessionList = pflxXBotMergeSessionList;\n';
  new Function('sandbox', 'with (sandbox) {\n' + full + '\n}')(sandbox);
  return sandbox;
}

const sb = makeSandbox();

// ---- pflxXBotMergeSession: basic field precedence ----
{
  const local = { id: 's1', title: 'Old Title', updatedAt: 100, status: 'scheduled' };
  const incoming = { id: 's1', title: 'New Title', updatedAt: 200, status: 'scheduled' };
  const m = sb.pflxXBotMergeSession(local, incoming);
  check('newer updatedAt wins on plain fields (title)', m.title === 'New Title');
}
{
  const local = { id: 's1', title: 'Local Newer', updatedAt: 500, status: 'scheduled' };
  const incoming = { id: 's1', title: 'Cloud Stale', updatedAt: 100, status: 'scheduled' };
  const m = sb.pflxXBotMergeSession(local, incoming);
  check('a stale cloud write never clobbers a newer local edit', m.title === 'Local Newer');
}
{
  const m = sb.pflxXBotMergeSession(null, { id: 's1', title: 'X' });
  check('merging against a missing local session returns incoming unchanged', m.title === 'X');
}
{
  const m = sb.pflxXBotMergeSession({ id: 's1', title: 'X' }, null);
  check('merging against a missing incoming session returns local unchanged', m.title === 'X');
}

// ---- liveParticipants: union by id, never drops a concurrent join ----
{
  const local = { id: 's1', updatedAt: 100, liveParticipants: [{ id: 'p1', joinedAt: 10 }] };
  const incoming = { id: 's1', updatedAt: 90, liveParticipants: [{ id: 'p2', joinedAt: 20 }] };
  const m = sb.pflxXBotMergeSession(local, incoming);
  const ids = m.liveParticipants.map(function (p) { return p.id; }).sort();
  check('liveParticipants unions both sides -- a concurrent join from either writer survives', ids.length === 2 && ids[0] === 'p1' && ids[1] === 'p2');
}
{
  const local = { id: 's1', updatedAt: 100, liveParticipants: [{ id: 'p1', joinedAt: 10 }] };
  const incoming = { id: 's1', updatedAt: 90, liveParticipants: [{ id: 'p1', joinedAt: 50 }] };
  const m = sb.pflxXBotMergeSession(local, incoming);
  check('same participant id keeps the later joinedAt regardless of which side is "newer" overall', m.liveParticipants[0].joinedAt === 50);
}

// ---- awardedTo: union, never shrinks (no double-award risk) ----
{
  const local = { id: 's1', updatedAt: 50, awardedTo: ['p1'] };
  const incoming = { id: 's1', updatedAt: 999, awardedTo: [] };
  const m = sb.pflxXBotMergeSession(local, incoming);
  check('awardedTo never shrinks even when the "newer" side has an empty/stale list', m.awardedTo.indexOf('p1') !== -1);
}

// ---- raceEvents: append-only union by event id ----
{
  const local = { id: 's1', updatedAt: 50, raceEvents: [{ id: 'e1', kind: 'boost' }] };
  const incoming = { id: 's1', updatedAt: 999, raceEvents: [{ id: 'e2', kind: 'freeze' }] };
  const m = sb.pflxXBotMergeSession(local, incoming);
  const ids = m.raceEvents.map(function (e) { return e.id; }).sort();
  check('raceEvents unions both sides -- a purchase made by either writer is never dropped', ids.length === 2 && ids[0] === 'e1' && ids[1] === 'e2');
}

// ---- status: a terminal status always wins, never resurrected ----
{
  const local = { id: 's1', updatedAt: 999, status: 'active' };
  const incoming = { id: 's1', updatedAt: 100, status: 'ended' };
  const m = sb.pflxXBotMergeSession(local, incoming);
  check('a terminal (ended) status from the STALE side still wins over a newer non-terminal status', m.status === 'ended');
}
{
  const local = { id: 's1', updatedAt: 100, status: 'archived' };
  const incoming = { id: 's1', updatedAt: 999, status: 'active' };
  const m = sb.pflxXBotMergeSession(local, incoming);
  check('a terminal (archived) status is never resurrected by a newer non-terminal write from the other side', m.status === 'archived');
}
{
  const local = { id: 's1', updatedAt: 50, status: 'scheduled' };
  const incoming = { id: 's1', updatedAt: 999, status: 'active' };
  const m = sb.pflxXBotMergeSession(local, incoming);
  check('when neither side is terminal, the newer updatedAt wins normally', m.status === 'active');
}

// ---- slides: index-aligned merge, responses union by player id ----
{
  const local = { id: 's1', updatedAt: 100, slides: [{ prompt: 'Q1', responses: { p1: 'A' } }] };
  const incoming = { id: 's1', updatedAt: 90, slides: [{ prompt: 'Q1', responses: { p2: 'B' } }] };
  const m = sb.pflxXBotMergeSession(local, incoming);
  const keys = Object.keys(m.slides[0].responses).sort();
  check('slide responses union by player id -- two students answering at once never clobber each other', keys.length === 2 && keys[0] === 'p1' && keys[1] === 'p2');
}

// ---- pflxXBotMergeSessionList: union two arrays by id ----
{
  const localList = [{ id: 's1', updatedAt: 100, title: 'Local Only' }];
  const incomingList = [{ id: 's2', updatedAt: 100, title: 'Cloud Only' }];
  const merged = sb.pflxXBotMergeSessionList(localList, incomingList);
  const ids = merged.map(function (s) { return s.id; }).sort();
  check('mergeSessionList keeps a session present on only one side', ids.length === 2 && ids[0] === 's1' && ids[1] === 's2');
}
{
  const localList = [{ id: 's1', updatedAt: 999, title: 'Local Wins' }];
  const incomingList = [{ id: 's1', updatedAt: 100, title: 'Cloud Stale' }];
  const merged = sb.pflxXBotMergeSessionList(localList, incomingList);
  check('mergeSessionList applies the same per-session merge, not a wholesale array overwrite', merged[0].title === 'Local Wins');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
