from harness import *
import json

def step(pg): return pg.evaluate("()=>[...document.querySelectorAll('.login-step.active')].map(x=>x.id).join(',')")

def run_claim(pg, entry, final_pin='5678', dialogs=None, shots='c'):
    """entry: ('email', addr) or ('name', fullname, typed_email)"""
    pg.once('dialog', lambda d: (dialogs.append(d.message) if dialogs is not None else None, d.accept()))
    pg.on('dialog', lambda d: (dialogs.append(d.message) if dialogs is not None else None, d.accept()))
    out = {}
    if entry[0] == 'email':
        pg.click('#goto-claim-btn'); pg.fill('#claim-email', entry[1]); pg.click('#claim-email-btn')
    else:  # signup by name -> match pre-entered
        pg.click('#goto-email-signup-btn')
        pg.fill('#signup-direct-fullname', entry[1]); pg.fill('#signup-direct-email', entry[2]); pg.click('#signup-direct-btn')
    pg.wait_for_timeout(1500)
    out['after_entry'] = step(pg)
    pg.screenshot(path=shots+'_1_code.png')
    if out['after_entry'] != 'step-claim-code': return out
    out['code_desc'] = pg.inner_text('#claim-code-desc')
    pg.fill('#claim-code-input', '9999'); pg.click('#claim-code-verify-btn'); pg.wait_for_timeout(800)
    out['wrong_code_step'] = step(pg); out['wrong_msg'] = pg.inner_text('#claim-code-msg')
    pg.fill('#claim-code-input', '4242'); pg.click('#claim-code-verify-btn'); pg.wait_for_timeout(1200)
    out['after_verify'] = step(pg)
    pg.screenshot(path=shots+'_2_found.png')
    if out['after_verify'] != 'step-imported-found': return out
    out['found_name'] = pg.inner_text('#imported-name'); out['found_cohort'] = pg.inner_text('#imported-cohort')
    pg.click('#imported-claim-btn'); pg.wait_for_timeout(500)
    out['after_claim'] = step(pg)
    pg.fill('#new-pin-1', final_pin); pg.fill('#new-pin-2', final_pin); pg.click('#set-pin-btn'); pg.wait_for_timeout(800)
    out['after_setpin'] = step(pg)
    pg.click('#diagnostic-skip-btn'); pg.wait_for_timeout(500)
    pg.click('#onboard-next-1'); pg.wait_for_timeout(300)
    pg.click('#interest-options .onboard-option >> nth=0'); pg.click('#onboard-next-3'); pg.wait_for_timeout(300)
    pg.fill('#slogan-input', 'Test slogan'); pg.click('#onboard-next-4'); pg.wait_for_timeout(500)
    pg.screenshot(path=shots+'_3_summary.png')
    pg.click('#onboard-finish'); pg.wait_for_timeout(300)
    out['before_final'] = step(pg)
    pg.fill('#final-pin-1', final_pin); pg.fill('#final-pin-2', final_pin); pg.click('#final-pin-btn'); pg.wait_for_timeout(4000)
    pg.screenshot(path=shots+'_4_after.png')
    return out
