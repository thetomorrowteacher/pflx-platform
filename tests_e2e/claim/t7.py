from t5helpers import *
with sync_playwright() as p:
    ros = base()
    env = Env(ros); b, pg = ctxs(p, env); pg.on('dialog', lambda dl: dl.accept())
    pg.goto(ORIGIN + '/'); pg.wait_for_timeout(5000)
    pg.evaluate("()=>{window.pflxPlayerRecordIsXLiveOnly=()=>true}")
    out = run_claim(pg, ('name','Other Student','x@gmail.com'), shots='t7'); pg.wait_for_timeout(6000)
    print('X-Live-only claim ->', cloud(env, 'player-import-B'), '| url now', pg.url)
    b.close()
