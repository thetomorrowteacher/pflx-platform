# Claim-flow end-to-end tests (Playwright, mocked Supabase)

Runs preview.html in headless Chromium against an in-memory fake of the Supabase REST + `pflx-claim-code`
function, so real players are never touched.

    pip install playwright && npm i --prefix sbjs @supabase/supabase-js@2
    PFLX_HTML=../../preview.html python3 t2.py   # claim on device A, log in on device B
    PFLX_HTML=../../preview.html python3 t3.py   # name claim, no-email, already-claimed, brand-new, caps/spaces
    PFLX_HTML=../../preview.html python3 t4.py   # studio/cohort/XC/email preserved

Run from this folder; the scripts read `preview.html` (override with PFLX_HTML).
