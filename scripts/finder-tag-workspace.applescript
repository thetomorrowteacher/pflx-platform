-- Finder visibility helper for PFLX workspaces.
-- Tags the active workspace GREEN and the iCloud copy RED so it's
-- impossible to confuse them in Finder. Also drops a desktop alias.
-- Idempotent — safe to re-run any time.

tell application "Finder"
    try
        set activeFolder to POSIX file "/Users/macbookpro/My Apps/PFLX Apps" as alias
        set label index of activeFolder to 6
    end try

    try
        set iCloudFolder to POSIX file "/Users/macbookpro/Library/Mobile Documents/com~apple~CloudDocs/Desktop/PFLX Apps" as alias
        set label index of iCloudFolder to 2
    end try

    try
        set theFolder to POSIX file "/Users/macbookpro/My Apps/PFLX Apps" as alias
        set desktopFolder to POSIX file "/Users/macbookpro/Desktop" as alias
        try
            delete (alias file "PFLX Apps (ACTIVE)" of desktopFolder)
        end try
        make new alias file at desktopFolder to theFolder with properties {name:"PFLX Apps (ACTIVE)"}
    end try
end tell

return "ok"
