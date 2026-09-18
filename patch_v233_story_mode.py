# PATCH PLATFORM v233 -- Story Mode.
#
# Reporter: Ennis. Ask: "build story mode. X-Live will integrate with this as
# well." plus the BRANDBUILDER / ALTER EGO Activity Guide.
#
# What this adds: a seventh top-level view, Story Mode, that plays the season
# as a campaign. Act Zero and Act One are The Alter Ego (studio, Personality
# Trait Inventory, Character Forge, Character Profile, Brand Board, and the
# Alter Ego card). Acts Two through Six are BrandBuilder: The Design Thinking
# Game -- client select, an RPG client interview, Client Profile, a drag-and-
# drop Empathy Map, the three SparkLab rounds, the Developer's Workshop daily
# log, the FeedForward mini course, Exhibit and the Showcase.
#
# Root cause of the thing it replaces: the two projects lived only as a Google
# Doc checklist and a pile of Canva links, so a player had no single surface
# that told them where they were in the season, and nothing awarded X-Coin for
# the work they actually did. Story Mode is that surface. Every quest completion
# routes through PflxDataBus.award, so the currency stays on one code path.
#
# The clients are the eight leads of The Nexus Narratives, and each interview
# answer is drawn from that character's graphic-audio script, so the story a
# student listens to is literally the brief they then solve.
#
# Progress is per player in app_data key pflx_story_<playerId>, mirrored to
# localStorage, same push/load helpers as everything else.
import sys, io

path = sys.argv[1] if len(sys.argv) > 1 else 'preview.html'
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()
orig = len(src)

def once(s, old, new, label):
    n = s.count(old)
    if n != 1:
        raise SystemExit('FAIL (%s): expected 1 occurrence, found %d' % (label, n))
    return s.replace(old, new, 1)

if 'PATCH PLATFORM v233' in src:
    print('OK -- already applied, no change. len=%d' % orig)
    raise SystemExit(0)

CSS = open('story_assets/story.css', encoding='utf-8').read()
JS  = open('story_assets/story.js', encoding='utf-8').read()
DAT = open('story_assets/story_data.js', encoding='utf-8').read()
CLI = open('story_assets/clients.js', encoding='utf-8').read()

# 1. version bump
src = once(src, "window.PFLX_PATCH   = 232", "window.PFLX_PATCH   = 233", "version bump")

# 2. styles -- appended to the end of the last stylesheet block before </head>
src = once(src, "\n    </style>\n</head>",
           "\n/* \u2550\u2550\u2550 PATCH PLATFORM v233 -- Story Mode \u2550\u2550\u2550 */\n"
           + CSS + "\n/* \u2550\u2550\u2550 /PATCH PLATFORM v233 \u2550\u2550\u2550 */\n    </style>\n</head>",
           "story css")

# 3. the nav button, right after the Battle Arena button
NAVA = ('<button class="nav-btn" data-view="arena"')
src = once(src, NAVA,
           '<button class="nav-btn" data-view="story" title="Story Mode">'
           '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
           'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
           '<path d="M4 19.5V5a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v13"/>'
           '<path d="M6 17h12a2 2 0 0 1 0 4H6a2 2 0 0 1 0-4z"/>'
           '<path d="M9 7h6M9 10h4"/></svg></button>\n                    ' + NAVA,
           "story nav button")

# 4. the view container, before the portfolio view
PORT = '<div class="view portfolio-view" style="overflow-y:auto; padding:0;">'
src = once(src, PORT,
           '<div class="view story-view"><div id="sm-root"></div></div>\n            ' + PORT,
           "story view container")

# 5. the router entry
src = once(src, "                'settings': 'settings-view'\n            };\n\n            const viewEl = document.querySelector(",
           "                'settings': 'settings-view',\n                'story': 'story-view'\n            };\n\n            const viewEl = document.querySelector(",
           "viewMap entry")

# 6. boot Story Mode when its view opens
src = once(src, "            if (viewName === 'portfolio') {",
           "            if (viewName === 'story') {\n"
           "                try { if (typeof window.pflxStoryBoot === 'function') window.pflxStoryBoot(); } catch (e) {}\n"
           "            }\n"
           "            if (viewName === 'portfolio') {",
           "story boot hook")

# 7. the Home App Hub tile
HUB = "{ key: 'arena',"
src = once(src, HUB,
           "{ key: 'story', name: 'Story Mode', icon: 'public/Core Pathway Main Icon.png', accent: '#8dff6a', "
           "iconScale: 1.0, desc: 'The season, played as a campaign. Build your Alter Ego, take a client out of "
           "The Nexus Narratives, and run BrandBuilder end to end.' },\n          " + HUB,
           "home app hub tile")

# 8. the module itself, just before the closing body tag
src = once(src, "\n</body>",
           "\n<!-- \u2550\u2550\u2550 PATCH PLATFORM v233 -- Story Mode \u2550\u2550\u2550 -->\n"
           "<script>window.PFLX_STORY_ART = 'public/story-art/';</script>\n"
           "<script>\n" + DAT + "\n</script>\n"
           "<script>\n" + CLI + "\n</script>\n"
           "<script>\n" + JS + "\n</script>\n"
           "<!-- \u2550\u2550\u2550 /PATCH PLATFORM v233 \u2550\u2550\u2550 -->\n</body>",
           "story module")

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print('OK -- Story Mode applied. %d -> %d chars (+%d)' % (orig, len(src), len(src) - orig))
