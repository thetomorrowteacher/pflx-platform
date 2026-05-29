#!/bin/bash
# Refresh Finder tag metadata + bounce Finder so the colored tags actually
# render on the folder icons. Run after finder-tag-workspace.applescript.

set -e

ACTIVE='/Users/macbookpro/My Apps/PFLX Apps'
ICLOUD='/Users/macbookpro/Library/Mobile Documents/com~apple~CloudDocs/Desktop/PFLX Apps'

# Force Spotlight to re-index so the tag metadata propagates.
mdimport "$ACTIVE" 2>/dev/null || true
mdimport "$ICLOUD" 2>/dev/null || true

# Bounce Finder — when it relaunches the new tag colors show on the icons.
osascript -e 'tell application "Finder" to quit'
sleep 1
open -a Finder

echo "done"
