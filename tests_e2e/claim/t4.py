from t3lib import *
with sync_playwright() as p:
    for who, entry in [('A email', ('email','test.claimer@asb.ac.th')), ('B name+personal', ('name','Other Student','personal@gmail.com'))]:
        env = Env(base()); b, pg = ctxs(p, env); pg.on('dialog', lambda dl: dl.accept())
        pg.goto(ORIGIN + '/'); pg.wait_for_timeout(5000)
        out = run_claim(pg, entry, shots='t4'); pg.wait_for_timeout(6000)
        tid = 'player-import-A' if who.startswith('A') else 'player-import-B'
        r = [x for x in env.store['pflx_mc_players']['items'] if x['id']==tid][0]
        pr = env.store['pflx_player_'+tid]
        sess = pg.evaluate("()=>({id:activeSession.id,cohort:activeSession.cohort,studio:activeSession.studioId})")
        print(who, '| roster:', {k: r.get(k) for k in ['claimed','pin','email','cohort','cohorts','xc','totalXcoin','studioId','role']}, '| playerRow:', {k: pr.get(k) for k in ['claimed','pin','email','xc','studioId']}, '| session', sess, '| n roster', len(env.store['pflx_mc_players']['items']))
        b.close()
