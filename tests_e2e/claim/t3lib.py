from flow import *
def base():
    return [
     mk_player('player-import-A', 'Test Claimer', 'CLAIMER', 'test.claimer@asb.ac.th', 'DD Core 3', cohorts=['DD Core 3','Falcon Studios'], xc=2500, xcoin=2500, totalXcoin=2500, studioId='studio-mindforge', studioName='Mindforge', digitalBadges=1, badges=[{'id':'pflx-user-cert','name':'PFLX User Cert'}]),
     mk_player('player-import-B', 'Other Student', 'OTHERS', 'other.student@asb.ac.th', 'Falcon Studios', xc=100, xcoin=100, totalXcoin=100),
     mk_player('player-import-C', 'No Email Kid', 'NOMAIL', '', 'DD Core 3'),
     mk_player('player-import-D', 'Already Claimed', 'DONE', 'done@asb.ac.th', 'DD Core 3', claimed=True, pin='4321'),
    ]
def ctxs(p, env):
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width':1200,'height':900}); attach(ctx, env)
    pg = ctx.new_page(); return b, pg
def counts(pg):
    return pg.evaluate("()=>({players: PLAYERS.length, mc: mcPlayers.length, byName: PLAYERS.concat(mcPlayers).filter((p,i,a)=>a.findIndex(x=>x.id===p.id)===i).length})")
