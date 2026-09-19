# PATCH PLATFORM v236 -- the Nexus fills the top of Story Mode and fades out.
#
# Reporter: Ennis, looking at the Story Mode hero and the Narratives covers:
# "The image should fill the whole top screen yet the bottom should fade out."
#
# Root cause: v235 put the right artwork in, but the hero was still built the
# way it was when the art was a placeholder -- a 46vh band with the image at
# 34% opacity under a flat dark gradient. The ring was there and you could not
# see it. A picture that is the setting of the whole campaign was being treated
# as texture.
#
# FIX (css only, swapped between the existing v233 style sentinels):
#   - hero grows to min(72vh, 720px) so the Ring actually fills the top
#   - the image goes to 82% opacity and is MASKED rather than veiled: a
#     linear-gradient mask takes it to fully transparent at the bottom edge, so
#     it dissolves into the page instead of sitting in a box with a dark sheet
#     over it
#   - the copy block drops to min(34vh, 300px) of top padding so the title
#     emerges out of the fade rather than competing with the brightest part
#   - narrow screens get a contrast floor: a heavier lower scrim plus text
#     shadows on the kicker, the mast and the lede, because at 390px the copy
#     lands on the lit rim of the ring
import sys

path = sys.argv[1] if len(sys.argv) > 1 else 'preview.html'
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()
orig = len(src)

if 'PATCH PLATFORM v236' in src:
    print('OK -- already applied, no change. len=%d' % orig)
    sys.exit(0)

CSS = open('story_assets/story.css', encoding='utf-8').read()

def once(s, old, new, label):
    n = s.count(old)
    if n != 1:
        raise SystemExit('FAIL (%s): expected 1 occurrence, found %d' % (label, n))
    return s.replace(old, new, 1)

src = once(src, 'window.PFLX_PATCH   = 235', 'window.PFLX_PATCH   = 236', 'version bump')

css_open  = '/* ═══ PATCH PLATFORM v233 -- Story Mode ═══ */\n'
css_close = '\n/* ═══ /PATCH PLATFORM v233 ═══ */'
i = src.find(css_open); j = src.find(css_close, i)
if i < 0 or j < 0:
    raise SystemExit('FAIL: v233 css sentinels not found')
src = src[:i + len(css_open)] + CSS + src[j:]

src = once(src, '<!-- ═══ /PATCH PLATFORM v233 ═══ -->',
           '<!-- ═══ PATCH PLATFORM v236 -- the Nexus fills the top and fades out ═══ -->\n'
           '<!-- ═══ /PATCH PLATFORM v233 ═══ -->', 'v236 marker')

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print('OK -- Story Mode hero applied. %d -> %d chars (%+d)' % (orig, len(src), len(src) - orig))
