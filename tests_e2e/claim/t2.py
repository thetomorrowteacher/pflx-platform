from flow import *
import sys
roster = [
 mk_player('player-import-A', 'Test Claimer', 'CLAIMER', 'test.claimer@asb.ac.th', 'DD Core 3', cohorts=['DD Core 3','Falcon Studios'], xc=2500, xcoin=2500, totalXcoin=2500, badges=[{'id':'b1','name':'Starter'}], digitalBadges=1),
 mk_player('player-import-B', 'Other Student', 'OTHERS', 'other.student@asb.ac.th', 'DD Core 3'),
]
env = Env(roster)
def new_device(p, env):
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width':1200,'height':900}); attach(ctx, env)
    pg = ctx.new_page(); pg.on('dialog', lambda d: d.accept()); return b, pg
def login_state(pg):
    return pg.evaluate("()=>({loginVisible: !!document.querySelector('#step-login.active'), session: (typeof activeSession!=='undefined'&&activeSession)?{id:activeSession.id,brand:activeSession.brand||activeSession.brandName,xc:activeSession.xcoin}:null, mainShown: !!document.querySelector('.login-view') && getComputedStyle(document.querySelector('.login-view')).opacity})")
with sync_playwright() as p:
    b1, pg1 = new_device(p, env)
    pg1.goto(ORIGIN + '/'); pg1.wait_for_timeout(5000)
    out = run_claim(pg1, ('email', 'test.claimer@asb.ac.th'), shots='t2')
    print('deviceA claim:', out.get('after_claim'), out.get('before_final'))
    pg1.wait_for_timeout(6000)  # let cloud pushes flush
    print('cloud roster A:', [(x['id'], x.get('claimed'), x.get('pin'), x.get('xc'), x.get('role'), x.get('cohort')) for x in env.store['pflx_mc_players']['items']][:1])
    print('cloud rows:', {k:(v.get('claimed'), v.get('pin')) for k,v in env.store.items() if k.startswith('pflx_player_') and isinstance(v,dict) and 'claimed' in v})
    print('users row A:', [(u.get('claimed'), u.get('pin'), u.get('xcoin')) for u in env.store['users'] if u['id']=='player-import-A'])
    # Device B: fresh browser, log in with brand + NEW pin
    b2, pg2 = new_device(p, env)
    pg2.goto(ORIGIN + '/'); pg2.wait_for_timeout(6000)
    pg2.fill('#brand-select', 'CLAIMER'); pg2.fill('#pin-input', '1111'); pg2.click('#login-btn'); pg2.wait_for_timeout(2500)
    print('deviceB OLD pin 1111 ->', login_state(pg2))
    pg2.reload(); pg2.wait_for_timeout(6000)
    pg2.fill('#brand-select', 'CLAIMER'); pg2.fill('#pin-input', '5678'); pg2.click('#login-btn'); pg2.wait_for_timeout(4000)
    print('deviceB NEW pin 5678 ->', login_state(pg2))
    pg2.screenshot(path='t2_B.png')
    b1.close(); b2.close()
