/* ------------------------------------------------------------------- i18n
   English is the base dictionary and the fallback for any missing key.

   Only English is complete. The other locales below cover the navigation,
   editing, and export surfaces; they are drafts and should be reviewed by a
   native speaker before shipping. Adding a language means adding one object
   to DICTIONARIES with the same keys; nothing else needs to change. */
/* Strings live in one dictionary so translating the app means adding an object
   here, not hunting through the code. English is the only complete locale and
   is the fallback for any missing key.

   Drafts for German, Spanish, French, Italian, Dutch and Portuguese were
   removed: each covered only about half the keys, so the UI rendered as a mix
   of translated and English screens, which is worse than a consistent English
   interface. To bring a language back, add a locale object here with the same
   keys and list it in LOCALE_NAMES. */
const DICTIONARIES = {
  en: {
    app_name: "Seclusa Notes",
    tab_notes: "Notes", tab_archive: "Archive", tab_trash: "Trash",
    action_search: "Search", action_menu: "Menu", action_new_note: "New note",
    action_back: "Back", action_pin: "Pin note", action_convert: "Cycle note type",
    action_archive: "Archive note", action_delete: "Delete note", action_note_options: "Note options",
    action_sort_order: "Sort order", action_clear_filters: "Clear search and label filter",
    action_import: "Import JSON",
    action_erase_all: "Erase all notes", action_enable_reminders: "Enable reminders",
    action_reminders_enabled: "Reminders enabled", action_reminders_blocked: "Reminders blocked in settings",
    action_reminders_unsupported: "Reminders unsupported here", action_undo: "Undo", action_redo: "Redo",
    action_labels: "Labels", action_type: "Type", action_reminder: "Reminder",
    action_modified: "Modified", action_created: "Created", action_duplicate: "Duplicate",
    action_share: "Share as text", action_remove_label: "Delete label",
    action_new_label: "New label", action_add_label: "Add label",
    action_reorder: "Reorder",
    action_delete_forever: "Delete permanently",
    dialog_delete_label_title: "Delete label?",
    dialog_delete_label_body: "The label is removed from every note that uses it. Notes themselves are kept.",
    sort_by: "Sort by", sort_title: "Title", sort_modified: "Last modified",
    sort_created: "Date created", sort_manual: "Manual",
    direction: "Direction", direction_ascending: "Ascending", direction_descending: "Descending",
    empty_no_notes: "No notes yet", empty_archive: "Archive is empty", empty_trash: "Trash is empty",
    empty_no_label: "No notes with this label", empty_no_search: "No notes match your search",
    filter_all: "All", type_text: "Text", type_list: "List", type_draw: "Draw",
    action_draw: "Draw", action_erase: "Erase", action_clear: "Clear", action_dots: "Dots",
    action_select: "Select notes", action_select_all: "All", action_cancel: "Cancel",
    action_restore: "Restore", sel_archive: "Archive", sel_trash: "Trash", sel_restore: "Restore",
    select_count: "{n} selected", dialog_forever_body: "The selected notes will be deleted permanently.",
    reminder_none: "None", reminder_overdue: "Overdue", reminder_done: "done",
    reminder_date: "Date", reminder_time: "Time", reminder_repeat: "Repeat",
    reminder_no_repeat: "Does not repeat", reminder_daily: "Daily",
    reminder_weekly: "Weekly", reminder_monthly_date: "Monthly on this date",
    reminder_monthly_weekday: "Monthly on this weekday", reminder_yearly: "Yearly",
    reminder_repeat_on: "Repeat on", reminder_save: "Save reminder",
    reminder_mark_done: "Mark as done", reminder_postpone: "Postpone 1 day",
    reminder_remove: "Remove reminder",
    recurrence_daily: "Daily", recurrence_weekdays: "Weekdays", recurrence_weekends: "Weekends",
    toast_export_failed: "Import failed.",
    toast_archived: "Archived", toast_unarchived: "Moved back to notes",
    toast_moved_to_trash: "Moved to trash", toast_deleted_forever: "Deleted permanently",
    toast_erased: "All notes erased", toast_imported: "Imported",
    toast_clear_before_draw: "Clear this note before switching to Draw",
    toast_save_failed: "This change could not be saved. Export a backup to be safe.",
    notify_reminder_title: "Reminder", notify_reminder_body: "Tap to open your note",
    toast_imported_newer: "file is from a newer version, some fields may be missing",
    toast_copied: "Copied to clipboard", toast_share_failed: "Could not share",
    toast_import_failed: "Could not read that file.",
    toast_dates_reset: "Dates reset to now",
    toast_modified_now: "Modified date set to now",
    toast_storage_unavailable: "Storage unavailable, notes will not be saved.",
    toast_filter_cleared: "Filters cleared", toast_too_large: "That file is too large to import.",
    toast_undo: "Undone", toast_redo: "Redone", toast_nothing_undo: "Nothing to undo",
    toast_nothing_redo: "Nothing to redo",
    toast_reminder_set: "Reminder set for {when}",
    toast_reminder_set_recurring: "Reminder set, {when}",
    toast_reminder_failed: "Could not set that reminder.",
    toast_backup_saved: "Backup saved.",
    toast_backup_saved_enc: "Encrypted backup saved.",
    toast_backup_downloaded: "Backup downloaded.",
    toast_backup_downloaded_enc: "Encrypted backup downloaded.",
    toast_backup_shared: "Backup shared.",
    toast_backup_shared_enc: "Encrypted backup shared.",
    toast_share_unavailable: "Sharing isn’t available here. Use Save / Download instead.",
    toast_backup_failed: "Backup failed.",
    toast_encrypting: "Encrypting…",
    toast_encryption_unavailable: "Encryption is unavailable in this browser.",
    note_reminders_limit: "Reminders can only fire while this app is open. Anything due while it was closed is shown the next time you open it.",
    action_undo_label: "Undo", action_redo_label: "Redo",
    dialog_erase_title: "Erase everything?", dialog_erase_cancel: "Cancel", dialog_erase_ok: "Erase",
    dialog_password_title: "Set a password", dialog_password_body:
      "The export is encrypted with this password. There is no way to recover the notes without it.",
    dialog_password_confirm_title: "Confirm password", dialog_password_mismatch:
      "Passwords do not match", dialog_password_ok: "Encrypt and export",
    dialog_password_too_short: "Use at least 8 characters.",
    dialog_decrypt_title: "Password required", dialog_decrypt_body:
      "This file is encrypted. Enter the password it was exported with.",
    dialog_decrypt_ok: "Decrypt and import", dialog_wrong_password:
      "Wrong password, or the file is damaged.",
    language: "Language", locale_name: "English",
    action_new_note_undo: "New note",
    action_edit_note: "Edit note",
    action_set_reminder: "Set reminder",
    action_import_file: "Import",
  }
};


const LOCALE_NAMES = { en: "English" };


const i18n = {
  locale: "en",
  tag: "en",

  available() { return Object.keys(DICTIONARIES).sort(); },

  setLocale(code) {
    // Only English ships, but an unknown code still resolves safely so a stale
    // stored value cannot leave the interface blank.
    if (!DICTIONARIES[code]) code = "en";
    this.locale = code;
    this.tag = "en-GB";
    if (typeof document !== "undefined") document.documentElement.lang = code;
    db.setMetaSafe("locale", code);
    this.apply();
  },

  /* Falls back to English, then to the key itself, so a missing translation
     shows something readable instead of an empty string. */
  t(key, vars) {
    const dict = DICTIONARIES[this.locale] || DICTIONARIES.en;
    let s = dict[key];
    if (s === undefined) s = DICTIONARIES.en[key];
    if (s === undefined) return key;
    if (vars) for (const k of Object.keys(vars)) s = s.split("{" + k + "}").join(vars[k]);
    return s;
  },

  /* Applies translations to the static markup. */
  apply(root) {
    const scope = root || document;
    for (const el of scope.querySelectorAll("[data-i18n]")) {
      el.textContent = this.t(el.dataset.i18n);
    }
    for (const el of scope.querySelectorAll("[data-i18n-title]")) {
      el.title = this.t(el.dataset.i18nTitle);
      el.setAttribute("aria-label", this.t(el.dataset.i18nTitle));
    }
    for (const el of scope.querySelectorAll("[data-i18n-placeholder]")) {
      el.placeholder = this.t(el.dataset.i18nPlaceholder);
    }
  },
}

const tr = (key, vars) => i18n.t(key, vars);
