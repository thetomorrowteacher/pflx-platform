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
res = {}
with sync_playwright() as p:
    # B: claim by NAME with a personal email that is NOT the roster email
    env = Env(base()); b, pg = ctxs(p, env); d = []
    pg.on('dialog', lambda dl: (d.append(dl.message), dl.accept()))
    pg.goto(ORIGIN + '/'); pg.wait_for_timeout(5000); n0 = counts(pg)
    out = run_claim(pg, ('name', 'other student', 'personal@gmail.com'), shots='t3b')
    pg.wait_for_timeout(5000)
    print('B name-claim w/ personal email:', {k: out.get(k) for k in ['after_entry','code_desc','after_verify','found_name','found_cohort','before_final']}, 'dialogs', d)
    print('   code request went to roster email:', [c.get('email') for c in env.codes_requested], 'playerId:', [c.get('playerId') for c in env.codes_requested])
    ids = [x['id'] for x in env.store['pflx_mc_players']['items']]
    r = [x for x in env.store['pflx_mc_players']['items'] if x['id']=='player-import-B'][0]
    print('   roster ids', ids, '| B:', (r['claimed'], r['pin'], r['cohort'], r.get('xc'), r.get('email')))
    print('   record counts before/after', n0, counts(pg)); b.close()
    # C: no email on file
    env = Env(base()); b, pg = ctxs(p, env); d = []
    pg.on('dialog', lambda dl: (d.append(dl.message), dl.accept()))
    pg.goto(ORIGIN + '/'); pg.wait_for_timeout(5000); n0 = counts(pg)
    pg.click('#goto-email-signup-btn'); pg.fill('#signup-direct-fullname', 'No Email Kid'); pg.fill('#signup-direct-email', 'kid@gmail.com'); pg.click('#signup-direct-btn'); pg.wait_for_timeout(1500)
    print('C no-email roster player ->', step(pg), '| dialogs', d, '| codes sent', len(env.codes_requested), '| counts', n0, counts(pg)); b.close()
    # D: already claimed player tries to sign up again
    env = Env(base()); b, pg = ctxs(p, env); d = []
    pg.on('dialog', lambda dl: (d.append(dl.message), dl.accept()))
    pg.goto(ORIGIN + '/'); pg.wait_for_timeout(5000); n0 = counts(pg)
    pg.click('#goto-email-signup-btn'); pg.fill('#signup-direct-fullname', 'Already Claimed'); pg.fill('#signup-direct-email', 'whatever@gmail.com'); pg.click('#signup-direct-btn'); pg.wait_for_timeout(1500)
    print('D already-claimed signup ->', step(pg), '| dialogs', d, '| counts', n0, counts(pg)); b.close()
    # E: genuinely new person (control) still gets a new PlayerPool account
    env = Env(base()); b, pg = ctxs(p, env); d = []
    pg.on('dialog', lambda dl: (d.append(dl.message), dl.accept()))
    pg.goto(ORIGIN + '/'); pg.wait_for_timeout(5000); n0 = counts(pg)
    pg.click('#goto-email-signup-btn'); pg.fill('#signup-direct-fullname', 'Brand New Person'); pg.fill('#signup-direct-email', 'new.person@gmail.com'); pg.click('#signup-direct-btn'); pg.wait_for_timeout(1500)
    print('E unknown person ->', step(pg), '| dialogs', d, '| codes sent', len(env.codes_requested), '| counts', n0, counts(pg)); b.close()
    # F: claim by email typed with caps/space
    env = Env(base()); b, pg = ctxs(p, env); d = []
    pg.on('dialog', lambda dl: (d.append(dl.message), dl.accept()))
    pg.goto(ORIGIN + '/'); pg.wait_for_timeout(5000)
    pg.click('#goto-claim-btn'); pg.fill('#claim-email', '  Test.Claimer@ASB.ac.th '); pg.click('#claim-email-btn'); pg.wait_for_timeout(1500)
    print('F email typed w/ caps+spaces ->', step(pg), [c.get('email') for c in env.codes_requested]); b.close()
