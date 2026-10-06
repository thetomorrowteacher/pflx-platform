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
