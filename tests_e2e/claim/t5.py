from t3lib import *
INSPECT = """(id)=>{
  const f = a => (a||[]).find(p=>p && p.id===id);
  const mp = f(mcPlayers), pl = f(PLAYERS);
  const cert = b => (b||[]).filter(x=>x && (x.id==='pflx-user-cert'||x.name==='PFLX User Cert'||x==='pflx-user-cert')).length;
  return {mc: mp && {badges:(mp.badges||[]).length, cert:cert(mp.badges), xc:mp.xc, total:mp.totalXcoin, dig:mp.digitalBadges, role:mp.role},
          players: pl && {badges:(pl.badges||[]).length, cert:cert(pl.badges), xc:pl.xc, dig:pl.digitalBadges},
          session: activeSession && {dig:activeSession.digitalBadges, xc:activeSession.xc, role:activeSession.role}}
}"""
def cloud(env, pid):
    r = [x for x in env.store['pflx_mc_players']['items'] if x['id']==pid]
    pr = env.store.get('pflx_player_'+pid) or {}
    us = [u for u in env.store['users'] if u['id']==pid]
    cert = lambda b: sum(1 for x in (b or []) if isinstance(x, dict) and x.get('id')=='pflx-user-cert')
    return {'roster': r and {'cert': cert(r[0].get('badges')), 'xc': r[0].get('xc'), 'dig': r[0].get('digitalBadges')}, 'playerRow': {'cert': cert(pr.get('badges')), 'xc': pr.get('xc'), 'dig': pr.get('digitalBadges')}, 'users': us and {'xc': us[0].get('xcoin'), 'dig': us[0].get('digitalBadges')}}
with sync_playwright() as p:
    env = Env(base()); b, pg = ctxs(p, env); pg.on('dialog', lambda dl: dl.accept())
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    pg.goto(ORIGIN + '/'); pg.wait_for_timeout(5000)
    pg.click('#goto-email-signup-btn'); pg.fill('#signup-direct-fullname', 'Brand New Person'); pg.fill('#signup-direct-email', 'new.person@gmail.com'); pg.click('#signup-direct-btn'); pg.wait_for_timeout(1200)
    tp = pg.inner_text('#temp-pin-value').strip()
    pg.fill('#verify-email', 'new.person@gmail.com'); pg.fill('#verify-pin', tp); pg.click('#verify-claim-btn'); pg.wait_for_timeout(600)
    pg.fill('#new-pin-1', '2468'); pg.fill('#new-pin-2', '2468'); pg.click('#set-pin-btn'); pg.wait_for_timeout(600)
    pg.click('#diagnostic-skip-btn'); pg.wait_for_timeout(400)
    pg.click('#onboard-next-1'); pg.wait_for_timeout(300)
    pg.click('#interest-options .onboard-option >> nth=0'); pg.click('#onboard-next-3'); pg.wait_for_timeout(300)
    pg.fill('#slogan-input', 'New slogan'); pg.click('#onboard-next-4'); pg.wait_for_timeout(400)
    pg.fill('#brand-name-input', 'NEWBIE'); pg.click('#onboard-next-5'); pg.wait_for_timeout(3000)
    pg.click('#studio-continue-btn'); pg.wait_for_timeout(500)
    print('step before finish:', pg.evaluate("()=>[...document.querySelectorAll('.onboard-page')].filter(p=>p.style.display!=='none').map(p=>p.id)"))
    pg.click('#onboard-finish'); pg.wait_for_timeout(300)
    pg.fill('#final-pin-1', '2468'); pg.fill('#final-pin-2', '2468'); pg.click('#final-pin-btn'); pg.wait_for_timeout(7000)
    pid = pg.evaluate("()=>activeSession.id")
    print('NEW SIGNUP', pid, pg.evaluate(INSPECT, pid)); print('  cloud', cloud(env, pid)); print('  errs', errs[:3])
    pg.screenshot(path='t5_new.png'); b.close()
