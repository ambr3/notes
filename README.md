# Seclusa Notes

A notebook you can add to your phone or computer.

Everything you write stays on your own device. There is no account to make and
no server sending anything anywhere.

## Forked From

Seclusa Notes started from
[Another Notes App](https://github.com/maltaisn/another-notes-app) by maltaisn
(Apache License 2.0).

What still comes from that project:

- The **notes data model** and **export schema version 5** (so files round-trip
  with the Android app)
- **Fractional ranking** for manual note order
- **Labels**, **archive**, **trash**, **pinned** notes, and **list** notes
- **Reminders** with the same RRULE subset the Android app writes

What Seclusa Notes added or replaced:

- A static **PWA** shell (service worker, offline, home-screen install)
- **IndexedDB** storage in the browser (no native app)
- Drawing notes, encrypted backups, undo/redo, and the Seclusa UI/theme
- No accounts, sync, analytics, or network calls for your notes

## Features

- Version 0.2.13
- Write notes in plain text. Edit them, delete them, bin them
- Checklist notes and drawing notes
- Labels, reminders, archive and bin
- Add it to your home screen and it opens on its own, no browser needed, and
  works with no internet connection
- Everything is stored on your device. Clearing your browser data, or emptying
  the bin, removes it
- Backup and restore from a JSON file (optional password encryption). Separate
  Share and Save / Download actions, plus a 30-day backup reminder. Exports use
  a `seclusa-notes` wrapper; plain Another Notes App files still import.

## Usage

Open it and press **New** to write a note. An empty draft is not kept if you
close without typing.

To add it to your home screen, open your browser's menu and choose "Add to Home
Screen".

Theme opens a sheet: **System**, **Light**, or **Dark**, plus a page background
(orange lines, a named colour, or a custom hex). The choice stays on this
device under the same preference keys as other Seclusa apps.

## HTTP Observatory

GitHub Pages cannot set `X-Frame-Options` or `nosniff`, so Observatory grades this app **B**.
Those knobs matter less here — no accounts, cookies, or privileged clicks; the tight meta CSP and local-only data are what protect you. ([scan PDF](Scan%20results%20-%20HTTP%20Observatory%20_%20MDN.pdf))

## License

This app includes code and fonts under their original licences:

| Part | Licence |
|---|---|
| Notes code derived from Another Notes App | Apache-2.0, see [LICENSE-APACHE-2.0.txt](LICENSE-APACHE-2.0.txt) |
| DM Sans and Sora fonts | SIL Open Font License 1.1, notices in `assets/fonts/` |

[LICENSE](LICENSE) explains the code licence; the font notices are included with
the font files.
