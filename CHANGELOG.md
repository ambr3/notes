# Changelog

All notable changes to **Seclusa Notes**.

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
