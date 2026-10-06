from t5helpers import *
with sync_playwright() as p:
    for label, entry, pid, xlive in [('claim B, normal', ('name','Other Student','x@gmail.com'), 'player-import-B', False),
                                     ('claim B, X-Live-only cohort', ('name','Other Student','x@gmail.com'), 'player-import-B', True),
                                     ('claim A (already has cert)', ('email','test.claimer@asb.ac.th'), 'player-import-A', False),
                                     ('claim D-instructor', ('email','inst@asb.ac.th'), 'player-import-I', False)]:
        ros = base() + [mk_player('player-import-I', 'Teach Er', 'TEACH', 'inst@asb.ac.th', 'DD Core 3', role='instructor', xc=500, xcoin=500, totalXcoin=500)]
        env = Env(ros); b, pg = ctxs(p, env); pg.on('dialog', lambda dl: dl.accept())
        pg.goto(ORIGIN + '/'); pg.wait_for_timeout(5000)
        if xlive: pg.evaluate("()=>{window.pflxPlayerRecordIsXLiveOnly=()=>true}")
        out = run_claim(pg, entry, shots='t6'); pg.wait_for_timeout(5000)
        print(label, '->', cloud(env, pid))
        b.close()
