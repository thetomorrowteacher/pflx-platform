import json, re, sys, time, urllib.parse
from playwright.sync_api import sync_playwright

import os
HTML = open(os.environ.get('PFLX_HTML','preview.html'), 'rb').read()
SB = 'https://hyxiagexyptzvetqjmnj.supabase.co'
ORIGIN = 'https://pflx.test'

def mk_player(i, name, brand, email, cohort, **kw):
    p = dict(id=i, name=name, brand=brand, brandName=brand, email=email, pin='1111', cohort=cohort,
             cohorts=[cohort], role='player', claimed=False, xc=0, xcoin=0, totalXcoin=0, badges=[],
             digitalBadges=0, level=1, rank=1, updatedAt=1700000000000, joinedAt='2026-07-29')
    p.update(kw); return p

class Env:
    def __init__(self, roster):
        self.store = {'pflx_mc_players': {'items': roster}, 'users': [dict(p) for p in roster]}
        self.log = []          # sb write log
        self.code = '4242'
        self.codes_requested = []
        self.verify_calls = []
    def rows(self, keys=None):
        return [{'key': k, 'data': v, 'updated_at': '2026-10-06T00:00:00Z'} for k, v in self.store.items() if keys is None or keys(k)]

SBJS = open('sbjs/node_modules/@supabase/supabase-js/dist/umd/supabase.js','rb').read()
def attach(ctx, env):
    ctx.route(re.compile(r'^https?://(?!pflx\.test|hyxiagexyptzvetqjmnj).*'), lambda r, q: r.abort())
    ctx.route(re.compile(r'^https://cdn\.jsdelivr\.net/npm/@supabase/supabase-js.*'), lambda r, q: r.fulfill(status=200, content_type='application/javascript', body=SBJS))
    def sb_handler(route, req):
        url = req.url; u = urllib.parse.urlparse(url); q = urllib.parse.parse_qs(u.query)
        path = u.path
        if path.startswith('/functions/v1/pflx-claim-code'):
            body = json.loads(req.post_data or '{}')
            if body.get('action') == 'request':
                env.codes_requested.append(body)
                em = (body.get('email') or '').lower()
                m = [p for p in env.store['pflx_mc_players']['items'] if (p.get('email') or '').lower() == em]
                if not m:
                    return route.fulfill(status=404, content_type='application/json', body=json.dumps({'ok': False, 'error': 'no_match'}))
                return route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'ok': True, 'masked': 'te*****', 'playerId': m[0]['id'], 'expiresInSec': 600, 'resendInSec': 45}))
            if body.get('action') == 'verify':
                env.verify_calls.append(body)
                ok = body.get('code') == env.code
                return route.fulfill(status=200 if ok else 401, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'ok': True} if ok else {'ok': False, 'error': 'wrong_code', 'attemptsLeft': 4}))
        if path.startswith('/rest/v1/app_data'):
            hdr = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
            if req.method == 'OPTIONS':
                return route.fulfill(status=204, headers=hdr)
            def split_top(t):
                out, d, cur = [], 0, ''
                for ch in t:
                    if ch == '(': d += 1
                    if ch == ')': d -= 1
                    if ch == ',' and d == 0: out.append(cur); cur = ''
                    else: cur += ch
                out.append(cur); return out
            def cond(c):
                m = re.match(r'key\.(eq|like|in)\.(.*)$', c)
                op, v = m.group(1), m.group(2)
                if op == 'eq': return lambda k: k == v
                if op == 'like': pat = re.escape(v).replace('\\*', '.*').replace('%', '.*'); return lambda k: re.fullmatch(pat, k) is not None
                vs = [x.strip('"') for x in v[1:-1].split(',')]; return lambda k: k in vs
            def match_keys():
                orf = q.get('or', [None])[0]
                if orf:
                    cs = [cond(c) for c in split_top(orf.strip('()'))]
                    return lambda k: any(c(k) for c in cs)
                kf = q.get('key', [None])[0]
                if kf is None: return lambda k: True
                if kf.startswith('eq.'): v = kf[3:]; return lambda k: k == v
                if kf.startswith('like.'): pat = re.escape(kf[5:]).replace('\\*', '.*').replace('%', '.*'); return lambda k: re.fullmatch(pat, k) is not None
                if kf.startswith('in.'): vs = [x.strip('"') for x in kf[4:-1].split(',')]; return lambda k: k in vs
                return lambda k: True
            if req.method == 'GET':
                rs = env.rows(match_keys())
                acc = req.headers.get('accept', '')
                if 'vnd.pgrst.object' in acc:
                    if not rs: return route.fulfill(status=406, headers=hdr, content_type='application/json', body='{}')
                    return route.fulfill(status=200, headers=hdr, content_type='application/json', body=json.dumps(rs[0]))
                return route.fulfill(status=200, headers=hdr, content_type='application/json', body=json.dumps(rs))
            if req.method in ('POST', 'PATCH', 'PUT'):
                body = json.loads(req.post_data or 'null')
                items = body if isinstance(body, list) else [body]
                for it in items:
                    if req.method == 'PATCH':
                        kf = q.get('key', [''])[0]; k = kf[3:] if kf.startswith('eq.') else it.get('key')
                        if k in env.store and 'data' in it: env.store[k] = it['data']; env.log.append(('PATCH', k))
                    else:
                        env.store[it['key']] = it['data']; env.log.append((req.method, it['key']))
                return route.fulfill(status=201, headers=hdr, content_type='application/json', body='[]')
        if path.startswith('/realtime') or 'websocket' in req.resource_type:
            return route.abort()
        return route.fulfill(status=200, headers={'access-control-allow-origin': '*'}, content_type='application/json', body='[]')
    ctx.route(re.compile(r'^https://hyxiagexyptzvetqjmnj\.supabase\.co/.*'), sb_handler)
    def page_handler(route, req):
        if req.url.rstrip('/') == ORIGIN or req.url.startswith(ORIGIN + '/?') or req.url == ORIGIN + '/preview.html':
            return route.fulfill(status=200, content_type='text/html; charset=utf-8', body=HTML)
        return route.fulfill(status=200, content_type='application/json', body='{}')
    ctx.route(re.compile(r'^https://pflx\.test/.*'), page_handler)
