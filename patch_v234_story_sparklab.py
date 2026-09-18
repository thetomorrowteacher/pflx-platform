# PATCH PLATFORM v234 -- SparkLab embedded in Story Mode's Ideate quests.
#
# Reporter: Ennis. Ask, with the Activity Guide: "The Player would then
# participate in the 'mini game' SparkLab to complete the Ideation Development
# Form. This version of SparkLab for round 1 will use the Spark Lab ideation
# selecter that I built earlier. This should all be activities within PFLX."
#
# Root cause of what this fixes: v233 shipped the three SparkLab quests as
# link-outs to the Canva site. That breaks the thing Ennis actually asked for
# -- the rounds are supposed to be activities INSIDE PFLX, on the same screen
# as the write-up, not a tab the student leaves for and forgets to come back
# from.
#
# SparkLab now runs embedded from https://thetomorrowteacher.github.io/sparklab/
# (its own GitHub Pages deployment -- the sellable build, self-contained, and
# serving no X-Frame-Options or frame-ancestors, so it frames cleanly). Each
# Ideate quest carries the board above its own fields, with a Bigger toggle and
# an open-in-a-tab fallback for anyone whose network blocks the frame.
#
# Naming discipline, per the canonical reference: SparkLab is PFLX's IDEATION
# DEVELOPMENT GAME. It is never described as a design thinking game. Round One
# is the Worst Idea Technique, Round Two is the Idea Generator, Round Three is
# drafting and sketching. BrandBuilder is the design thinking game; SparkLab is
# the mini game inside its Ideate phase.
import re, sys

path = sys.argv[1] if len(sys.argv) > 1 else 'preview.html'
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()
orig = len(src)

if 'PATCH PLATFORM v234' in src:
    print('OK -- already applied, no change. len=%d' % orig)
    sys.exit(0)

JS  = open('story_assets/story.js', encoding='utf-8').read()
CSS = open('story_assets/story.css', encoding='utf-8').read()

def once(s, old, new, label):
    n = s.count(old)
    if n != 1:
        raise SystemExit('FAIL (%s): expected 1 occurrence, found %d' % (label, n))
    return s.replace(old, new, 1)

# 1. version bump
src = once(src, 'window.PFLX_PATCH   = 233', 'window.PFLX_PATCH   = 234', 'version bump')

# 2. swap the CSS between the v233 style sentinels
css_open  = '/* ═══ PATCH PLATFORM v233 -- Story Mode ═══ */\n'
css_close = '\n/* ═══ /PATCH PLATFORM v233 ═══ */'
i = src.find(css_open); j = src.find(css_close, i)
if i < 0 or j < 0:
    raise SystemExit('FAIL: v233 css sentinels not found')
src = src[:i + len(css_open)] + CSS + src[j:]

# 3. swap the engine -- it is the LAST inline <script> inside the v233 html
#    sentinels, the one that defines pflxStoryBoot.
h_open  = '<!-- ═══ PATCH PLATFORM v233 -- Story Mode ═══ -->'
h_close = '<!-- ═══ /PATCH PLATFORM v233 ═══ -->'
a = src.find(h_open); b = src.find(h_close, a)
if a < 0 or b < 0:
    raise SystemExit('FAIL: v233 html sentinels not found')
block = src[a:b]
k = block.find('window.pflxStoryBoot')
if k < 0:
    raise SystemExit('FAIL: engine block not found between the sentinels')
s_start = block.rfind('<script>\n', 0, k)
s_end   = block.find('\n</script>', k)
if s_start < 0 or s_end < 0:
    raise SystemExit('FAIL: could not bound the engine script block')
newblock = block[:s_start] + '<script>\n' + JS + block[s_end:]
src = src[:a] + newblock + src[b:]

# 4. a marker so the patch is findable and idempotent
src = once(src, h_close,
           '<!-- ═══ PATCH PLATFORM v234 -- SparkLab embedded in the Ideate quests ═══ -->\n'
           + h_close, 'v234 marker')

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print('OK -- SparkLab embed applied. %d -> %d chars (%+d)' % (orig, len(src), len(src) - orig))
