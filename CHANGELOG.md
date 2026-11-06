# Changelog

All notable changes to **Seclusa Notes**.

## 0.2.13 — 2026-11-06

### Added
- Save a drawing as a PNG. Black pad uses white dots, and white ink when the current ink is black.

### Changed
- Launcher icon is a black outline of a note on a white tile.

### Fixed
- A damaged note, label, reminder, or saved view no longer blanks the app.
- A search that was open when you left is open again when you come back.
- A bulk edit stays undoable if a write fails partway through.

## 0.2.12 — 2026-11-03

### Changed
- Theme nav label is always **Theme** (mode chips stay System / Light / Dark in the sheet).
- Orange ruled lines faded further.
- About links point at the GitHub repo (`ambr3/notes`) for source, README, and privacy policy.

## 0.2.11 — 2026-11-03

### Added
- Theme sheet: System / Light / Dark plus background swatches (lines, named colours, custom hex).

## 0.2.10 — 2026-11-03

### Fixed
- Orange ruled-lines theme shows full-page again (opaque body background was covering it).

## 0.2.9 — 2026-11-03

### Added
- Separate **Share backup…** and **Save / Download backup…** actions (plain and encrypted).
- Last-backup label and a soft reminder after 30 days on the Backup sheet.

### Changed
- Share no longer falls back to download; if sharing is unavailable, use Save / Download.

## 0.2.8 — 2026-11-02

### Fixed
- Mobile portrait top bar: New no longer clips off-screen; brand can shrink
  and controls/editor toolbar tighten under 520px.

## 0.2.7 — 2026-11-02

### Changed
- Distinct B&W notes PWA icon (folded-corner sheet with ruled lines), so
  the launcher no longer matches Calendar. Regenerable via `tools/make_icons.py`.

## 0.2.6 — 2026-11-02

### Fixed
- Recurring reminders that fired while the app was closed now notify on
  reopen (catch-up no longer advances the series before showing).
- A failed editor save keeps the note dirty so close/retry cannot drop edits.
- The Modified control only updates the modified stamp (created stays put).
- Page-level reminder notifications open the note when tapped.
- Backup import writes labels and notes in one IndexedDB transaction and
  rolls the in-memory store back if that write fails.
- Notes loaded from IndexedDB are normalised; drawing payloads are revalidated.

## 0.2.5 — 2026-11-02

### Changed
- Accept Observatory **B** on GitHub Pages; README notes why the missing
  server headers are low practical risk for this app. Dropped unused `_headers`.
- Bundled the MDN HTTP Observatory scan PDF.

## 0.2.4 — 2026-11-02

### Changed
- CSP meta gains `frame-src 'none'` and `frame-ancestors 'none'` (browsers
  still ignore `frame-ancestors` in meta).

## 0.2.3 — 2026-11-02

### Changed
- Release packaging: dropped unused GPL licence file, added `.gitignore`.

## 0.2.2 — 2026-11-02

### Fixed
- New opens a draft; empty notes are not kept when you close without writing.
- Every label in the picker has a delete control.
- Theme matches the shared Seclusa template (system / light / dark, shared key,
  theme-boot before first paint). Removed the custom `bw` palette override.

### Changed
- Convert control label is “Cycle note type”.
- Reminder limit noted in the menu; backup/reminder toasts go through i18n.
- README states what remains from the Another Notes App fork.
- Dropped unused `LICENSE-GPL-3.0` (notes are Apache-2.0 only).

## 0.2.1 — 2026-11-02

### Fixed
- List and drawing note titles now save.
- Deleting a label no longer crashes; the label is stripped from every note that used it.
- Importing a backup no longer renames an existing label that shares a name.
- Manual reorder is undoable.
- Notes missing a labels array no longer break the list or export.
- App chrome is full-bleed on tablets and desktops (no more 520px column). The
  page itself no longer scrolls; only the notes list does.

### Changed
- Backups are written as `{ format: "seclusa-notes", version, notes }` wrapping the
  notes schema document. Plain schema files and older combined NoCal backups still restore.
- Removed leftover calendar/vault UI copy and the unused merge dialog.

## 0.2.0 — 2026-11-01

### Changed
- Seclusa Notes is now its own app, split out of Seclusa NoCal. The notes
  list, editor, labels, reminders, archive, bin and backup are unchanged; the
  calendar pane and its menu entry are gone.
- Backup files are named `seclusa-notes-<date>.json` and contain notes only.
  Combined NoCal backup files still restore, and the calendar part is reported
  as skipped.
- The service worker uses its own cache prefix, so installing the calendar
  alongside this app no longer clears the notes cache.
