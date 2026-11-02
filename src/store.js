/* ------------------------------------------------------------------ store */
const store = {
  notes: new Map(),
  labels: new Map(),
  nextId: 1,
  view: { status: STATUS.ACTIVE, label: null, search: "", field: SORT_FIELD.MODIFIED, dir: SORT_DIR.DESC },
  _listeners: [],

  onChange(fn) { this._listeners.push(fn); },
  emit() { for (const fn of this._listeners) fn(); },

  async load() {
    const notes = await db.getAll("notes");
    const labels = await db.getAll("labels");
    const meta = await db.getMeta("nextId");
    this.notes = new Map(notes.map((n) => [n.id, n]));
    this.labels = new Map(labels.map((l) => [l.id, l]));
    this.nextId = meta || this._inferNextId();
    const view = await db.getMeta("view");
    if (view) Object.assign(this.view, view);
  },
  _inferNextId() {
    let max = 0;
    for (const id of this.notes.keys()) if (typeof id === "number" && id > max) max = id;
    return max + 1;
  },
  persistView() { db.setMetaSafe("view", this.view); },

  labelColor(id) {
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return `hsl(${Math.abs(h) % 360} 55% 45%)`;
  },

  /* A new note goes to the top of the manual order. It must get a rank that is
   actually lower than every existing one: assigning the fixed INITIAL value
   to every new note made them all share a rank, so manual sort fell back to
   id order and drag-reordering could not separate them. */
  lowestRank() {
    let lowest = null;
    for (const n of this.notes.values()) {
      if (n.status === STATUS.DELETED) continue;
      const r = rankOf(n);
      if (lowest === null || r.compareTo(lowest) < 0) lowest = r;
    }
    return lowest;
  },

  /* Returns the note that was written, allocating an id and rank if new. */
  async put(note) {
    normalizeNote(note);
    if (note.id === undefined || note.id === null || note.id === 0) {
      note.id = this.nextId++;
      note.rank = FractionalIndex.insert(null, this.lowestRank()).toB64();
    }
    if (!note.rank) {
      note.rank = FractionalIndex.insert(null, this.lowestRank()).toB64();
    }
    this.notes.set(note.id, note);
    await db.put("notes", note);
    db.setMetaSafe("nextId", this.nextId);
    this.emit();
    return note;
  },
  async remove(id) {
    this.notes.delete(id);
    await db.del("notes", id);
    this.emit();
  },

  async putLabel(label) {
    if (label.id === undefined || label.id === null || label.id === 0) {
      label.id = this.nextId++;
    }
    this.labels.set(label.id, label);
    await db.put("labels", label);
    db.setMetaSafe("nextId", this.nextId);
    this.emit();
    return label;
  },

  /* Drops the label and strips it from every note that still references it. */
  async removeLabel(id) {
    this.labels.delete(id);
    await db.del("labels", id);
    for (const note of [...this.notes.values()]) {
      const labels = Array.isArray(note.labels) ? note.labels : [];
      if (!labels.includes(id)) continue;
      const fresh = { ...note, labels: labels.filter((l) => l !== id) };
      this.notes.set(note.id, fresh);
      await db.put("notes", fresh);
    }
    if (this.view.label === id) {
      this.view.label = null;
      this.persistView();
    }
    this.emit();
  },

  async newNote(patch, noteType = TYPE.TEXT) {
    const now = Date.now();
    return this.put({
      id: 0, type: noteType, title: "", content: "", metadata: blankMetadata(),
      added: now, modified: now, rank: null, status: STATUS.ACTIVE,
      pinned: PINNED.UNPINNED, labels: [], ...patch,
    });
  },

  /* Notes that carry a reminder, matching getNotesWithReminder(). */
  withReminder() {
    const out = [];
    for (const n of this.notes.values()) {
      if (n.reminder && n.status !== STATUS.DELETED) out.push(n);
    }
    return out;
  },

  /* Skips past occurrences that have already elapsed and parks the reminder on
     the next future one. Mirrors setNextNoteReminderAlarmInternal: a series
     that has run out keeps its old value and shows as overdue. */
  async catchUpReminders() {
    const now = Date.now();
    for (const note of this.withReminder()) {
      let r = note.reminder;
      const original = r;
      let guard = 0;
      while (r.next <= now) {
        const next = findNextReminder(r);
        if (next === r) break;      // not recurring, or the series is exhausted
        r = next;
        if (++guard > 500) break;
      }
      if (r !== original) {
        const fresh = { ...note, reminder: r };
        this.notes.set(note.id, fresh);
        await db.put("notes", fresh);
      }
    }
  },

  async setReminder(noteId, reminder) {
    const note = this.notes.get(noteId);
    if (!note) return null;
    // A deleted note cannot hold a reminder, matching the Room model check.
    const clean = note.status === STATUS.DELETED ? null : reminder;
    const fresh = { ...note, reminder: clean, modified: Date.now() };
    this.notes.set(noteId, fresh);
    await db.put("notes", fresh);
    // The editor keeps its own copy of the note. Without this the next flush
    // writes that stale copy back and silently undoes the change made here.
    if (typeof syncEditorReminder === "function") syncEditorReminder(noteId, clean);
    this.emit();
    return fresh;
  },

  /* A label filter that points at a deleted label would silently hide every
     note, so it is dropped rather than applied. */
  pruneView() {
    if (this.view.label !== null && !this.labels.has(this.view.label)) {
      this.view.label = null;
      this.persistView();
    }
  },

  visible() {
    const q = this.view.search.trim().toLowerCase();
    let out = [];
    for (const note of this.notes.values()) {
      if (note.status !== this.view.status) continue;
      if (this.view.label !== null && !(note.labels || []).includes(this.view.label)) continue;
      if (q) {
        const hay = (note.title + "\n" + notePreview(note)).toLowerCase();
        if (!hay.includes(q)) continue;
      }
      out.push(note);
    }
    const dir = this.view.dir === SORT_DIR.ASC ? 1 : -1;
    const field = this.view.field;
    out.sort((a, b) => {
      // Pinned notes always float to the top of the current list.
      const pin = (b.pinned === PINNED.PINNED ? 1 : 0) - (a.pinned === PINNED.PINNED ? 1 : 0);
      if (pin !== 0) return pin;
      let r = 0;
      if (field === SORT_FIELD.TITLE) {
        r = (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" });
        if (r === 0) r = a.id - b.id;
      } else if (field === SORT_FIELD.ADDED) r = a.added - b.added;
      else if (field === SORT_FIELD.MODIFIED) r = a.modified - b.modified;
      else r = rankOf(a).compareTo(rankOf(b));
      return r === 0 ? a.id - b.id : r * dir;
    });
    return out;
  },

  counts() {
    const c = [0, 0, 0];
    for (const n of this.notes.values()) {
      // An unrecognised status would index past the array and produce NaN,
      // which would then render as a count of "NaN".
      if (n.status >= 0 && n.status < c.length) c[n.status]++;
    }
    return c;
  },

};

/* ------------------------------------------------------------- notifications
   Honest limits of reminders in a PWA:

   - A notification can only be shown while the app is running, or from a
     service worker that something wakes. Browsers deliberately give web pages
     no reliable timer, so a reminder cannot fire while the app is closed.
   - Notification Triggers (showTrigger with a TimestampTrigger) would solve
     this, but it is desktop-only and unavailable on Android.
   - Therefore this app fires reminders while it is open, and on next launch
     it catches up anything that elapsed in the meantime.

   That is a real downgrade from the Android app, which uses AlarmManager with
   exact alarms and fires whether or not the app is running. */
const reminders = {
  supported: typeof Notification !== "undefined",
  permission: typeof Notification !== "undefined" ? Notification.permission : "unsupported",
  _timers: new Map(),   // noteId -> timeout id
  _fired: new Set(),    // "noteId@next", so a catch-up run cannot double-notify

  async requestPermission() {
    if (!this.supported) {
      toast(tr("action_reminders_unsupported"));
      return "unsupported";
    }
    if (Notification.permission === "granted") {
      this.permission = "granted";
      return "granted";
    }
    let result = Notification.permission;
    try {
      result = await Notification.requestPermission();
    } catch (e) {
      result = Notification.permission;
    }
    this.permission = result;
    return result;
  },

  /* setTimeout is capped because browsers clamp or drop very long delays.
     Anything further out is picked up by the resume check instead. */
  MAX_DELAY: 6 * 60 * 60 * 1000,

  reschedule() {
    for (const id of this._timers.keys()) clearTimeout(this._timers.get(id));
    this._timers.clear();
    if (this.permission !== "granted") return;
    const now = Date.now();
    for (const note of store.withReminder()) {
      const r = note.reminder;
      if (r.done || r.next <= now) continue;
      const delay = r.next - now;
      if (delay > this.MAX_DELAY) continue;
      const id = setTimeout(() => { this.fire(note.id).catch(() => {}); }, delay + 250);
      this._timers.set(note.id, id);
    }
  },

  async fire(noteId) {
    const note = store.notes.get(noteId);
    if (!note || !note.reminder) return;
    const r = note.reminder;
    const key = reminderKey(noteId, r.next);
    if (this._fired.has(key)) return;
    this._fired.add(key);
    if (this._fired.size > 200) this._fired = new Set([...this._fired].slice(-100));
    this.show(note);
    // Advance a recurring series; a one-off keeps its time and shows as overdue.
    const next = findNextReminder(r);
    if (next !== r) await store.setReminder(noteId, next);
    this.reschedule();
  },

  /* The notification names no note, so the lock screen shows nothing from it.
     Tapping it opens the note (see notificationclick in sw.js). */
  async show(note) {
    const title = tr("notify_reminder_title");
    const body = tr("notify_reminder_body");
    try {
      const reg = await navigator.serviceWorker?.ready;
      if (reg) {
        await reg.showNotification(title, {
          body, tag: "note-" + note.id, renotify: true,
          icon: "icon-192.png", badge: "icon-192.png",
          data: { noteId: note.id },
        });
        return;
      }
    } catch (e) { /* fall through to the page-level API */ }
    if (this.permission === "granted") {
      try { new Notification(title, { body, tag: "note-" + note.id, icon: "icon-192.png" }); }
      catch (e) { /* the platform refused; nothing useful to report */ }
    }
  },

  /* Called on launch and whenever the app returns to the foreground. Anything
     whose time passed while the app was shut fires now, once. */
  async catchUp() {
    await store.catchUpReminders();
    const now = Date.now();
    for (const note of store.withReminder()) {
      const r = note.reminder;
      if (r.done || r.next > now) continue;
      const key = reminderKey(note.id, r.next);
      if (this._fired.has(key)) continue;
      this._fired.add(key);
      if (this._fired.size > 200) this._fired = new Set([...this._fired].slice(-100));
      await this.show(note);
    }
    this.reschedule();
  },

  async markDone(noteId) {
    const note = store.notes.get(noteId);
    if (!note || !note.reminder) return;
    await store.setReminder(noteId, markReminderDone(note.reminder));
    this.reschedule();
  },

  async postpone(noteId, ms) {
    const note = store.notes.get(noteId);
    if (!note || !note.reminder) return;
    try {
      const moved = postponeReminder(note.reminder, note.reminder.next + ms);
      await store.setReminder(noteId, moved);
      this.reschedule();
    } catch (e) {
      toast(e.message);
    }
  },
};

/* ------------------------------------------------------- export / import */
/* Mirrors the Android app's NotesData / NoteSurrogate schema exactly, so
   exports round-trip between this app and the Android app. */
function toSurrogate(note) {
  const metadata = note.type === TYPE.LIST
    ? JSON.stringify({ checked: note.metadata.checked })
    : note.type === TYPE.DRAW
      ? JSON.stringify({ kind: "draw", data: note.metadata.data })
      : '"blank"';
  const out = {
    type: note.type, title: note.title, content: note.content, metadata,
    added: fmtDate(note.added), modified: fmtDate(note.modified),
    status: note.status, pinned: note.pinned,
    labels: (Array.isArray(note.labels) ? note.labels : []).slice(),
  };
  if (note.rank) out.rank = note.rank;
  if (note.reminder) out.reminder = reminderToSurrogate(note.reminder);
  return out;
}

/* The Android Reminder is serialized with UTC date strings and recurrence as
   an RRULE string. encodeDefaults is off in the app's Json config, so a null
   recurrence is omitted rather than written as null. */
function reminderToSurrogate(r) {
  const out = { start: fmtDate(r.start), next: fmtDate(r.next), count: r.count, done: !!r.done };
  const rrule = formatRRule(r.recurrence);
  if (rrule) out.recurrence = rrule;
  return out;
}

function reminderFromSurrogate(s) {
  if (!s || typeof s !== "object") return null;
  const start = parseDate(s.start !== undefined ? s.start : s.next);
  const next = parseDate(s.next !== undefined ? s.next : s.start);
  if (Number.isNaN(start) || Number.isNaN(next)) throw new BadData("bad reminder date");
  let recurrence = null;
  if (typeof s.recurrence === "string" && s.recurrence.trim()) {
    recurrence = parseRRule(s.recurrence);
    if (!recurrence) throw new BadData("unsupported recurrence: " + s.recurrence);
  }
  return {
    start, next, recurrence,
    count: Math.max(1, parseInt(s.count, 10) || 1),
    done: s.done === true,
  };
}
function serialize() {
  const notes = {};
  for (const n of store.notes.values()) notes[n.id] = toSurrogate(n);
  const labels = {};
  for (const l of store.labels.values()) labels[l.id] = { name: l.name, hidden: l.hidden === true };
  return JSON.stringify({ version: EXPORT_VERSION, notes, labels }, null, 1);
}

/* --------------------------------------------------------- import hardening
   An import file is attacker-controlled input. Everything read out of one is
   length-capped, type-checked, and range-checked before it reaches the store,
   so a malformed or hostile file cannot crash the app, fill memory, or create
   records that no screen can show and therefore no screen can delete. */
const IMPORT_MAX_FILE_BYTES = 32 * 1024 * 1024;
const IMPORT_MAX_NOTES = 20000;
const IMPORT_MAX_LABELS = 2000;
/* Per-field ceiling. The file-size cap bounds the whole import, but a single
   note could still carry a 30 MB body inside a 32 MB file, and that one note
   then costs a very long time to render on every list pass. A megabyte of text
   is far past any real note. Rejected rather than truncated: silently cutting a
   user's own words off during a restore is worse than refusing the file. */
const IMPORT_MAX_FIELD_CHARS = 1 * 1000 * 1000;
const IMPORT_MAX_TITLE = 20000;
const IMPORT_MAX_CONTENT = 4 * 1024 * 1024;
const IMPORT_MAX_LABEL_NAME = 500;
const IMPORT_MAX_LABELS_PER_NOTE = 500;
const IMPORT_MAX_RANK_BYTES = 64;
const IMPORT_MAX_DRAWING_CHARS = 8 * 1024 * 1024;

/* A drawing is only ever a PNG data URL produced by the canvas. Anything else
   from an import (other types, odd encodings, or a huge blob) is dropped. */
function validDrawing(v) {
  if (typeof v !== "string" || v.length > IMPORT_MAX_DRAWING_CHARS) return "";
  return /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(v) ? v : "";
}

function clampText(v, max) {
  return typeof v === "string" ? (v.length > max ? v.slice(0, max) : v) : "";
}
/* Keeps only values that are actually members of a named enum. Anything else
   falls back to the default, so no note can end up with a status no tab shows. */
function enumValue(v, table, fallback) {
  return typeof v === "number" && Object.values(table).includes(v) ? v : fallback;
}
/* The rank is decoded by atob() on every sort and every drag. A string that is
   not decodable base64 would throw inside render() and leave the app unusable,
   so an undecodable rank is dropped and reassigned instead. The size cap and
   the leading-byte check also reject crafted values that would make insert()
   synthesize an arbitrarily deep key: every legitimate rank from this scheme
   (and from the Android app, which shares it) begins with INT_MID. */
function validRank(v) {
  if (typeof v !== "string" || !v) return null;
  try {
    const bytes = fromB64(v);
    if (bytes.length === 0 || bytes.length > IMPORT_MAX_RANK_BYTES) return null;
    if (bytes[0] !== INT_MID) return null;
    return v;
  } catch (e) {
    return null;
  }
}

function fromSurrogate(s) {
  if (typeof s !== "object" || s === null) throw new BadData("note is not an object");
  const type = s.type === undefined ? TYPE.TEXT : s.type;
  if (type !== TYPE.TEXT && type !== TYPE.LIST && type !== TYPE.DRAW) throw new BadData("bad note type: " + s.type);
  const note = {
    id: 0, type,
    title: clampText(s.title, IMPORT_MAX_TITLE),
    content: clampText(s.content, IMPORT_MAX_CONTENT),
    metadata: blankMetadata(),
    added: parseDate(s.added),
    modified: parseDate(s.modified !== undefined ? s.modified : s.added),
    rank: validRank(s.rank),
    status: enumValue(s.status, STATUS, STATUS.ACTIVE),
    pinned: enumValue(s.pinned, PINNED, PINNED.UNPINNED),
    labels: Array.isArray(s.labels)
      ? s.labels.filter((x) => typeof x === "number" && Number.isFinite(x))
        .slice(0, IMPORT_MAX_LABELS_PER_NOTE)
      : [],
    reminder: reminderFromSurrogate(s.reminder),
  };
  // metadata arrives as a JSON-encoded string, exactly as kotlinx writes it.
  if (typeof s.metadata === "string") {
    let parsed;
    try { parsed = JSON.parse(s.metadata); } catch (e) { parsed = null; }
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.checked)) {
      note.metadata = listMetadata(parsed.checked.map(Boolean));
    } else if (parsed && parsed.kind === "draw") {
      note.metadata = { kind: "draw", data: validDrawing(parsed.data) };
    } else if (parsed === "blank" || parsed === null || parsed === undefined) {
      note.metadata = blankMetadata();
    } else {
      note.metadata = blankMetadata();
    }
  }
  return normalizeNote(note);
}

/* Merges imported data, resolving id and rank clashes the same way the
   Android importer does: same id plus same timestamps means the same note. */
async function importData(text) {
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (e) { throw new BadData("File is not valid JSON."); }
  if (!parsed || typeof parsed !== "object" || parsed.notes === undefined) {
    throw new BadData("File is not a notes export.");
  }
  const version = parsed.version;
  if (typeof version !== "number" || version < FIRST_VERSION) {
    throw new BadData("Unsupported export version: " + version);
  }

  const rawLabels = parsed.labels;
  if (rawLabels !== undefined && (typeof rawLabels !== "object" || rawLabels === null)) {
    throw new BadData("File is not a notes export.");
  }
  const rawNotes = parsed.notes;
  if (!rawNotes || typeof rawNotes !== "object" || Array.isArray(rawNotes)) {
    throw new BadData("File is not a notes export.");
  }
  const noteEntries = Object.entries(rawNotes);
  if (noteEntries.length > IMPORT_MAX_NOTES) {
    throw new BadData("File holds too many notes (max " + IMPORT_MAX_NOTES + ").");
  }
  const labelEntries = Object.entries(rawLabels || {});
  if (labelEntries.length > IMPORT_MAX_LABELS) {
    throw new BadData("File holds too many labels (max " + IMPORT_MAX_LABELS + ").");
  }
  // Checked before anything is written, so a refused import leaves the store
  // exactly as it was rather than half-applied.
  for (const [, s] of noteEntries) {
    const note = typeof s === "object" && s !== null ? s : {};
    if (typeof note.title === "string" && note.title.length > IMPORT_MAX_FIELD_CHARS) {
      throw new BadData("A note title is too long to import.");
    }
    if (typeof note.content === "string" && note.content.length > IMPORT_MAX_FIELD_CHARS) {
      throw new BadData("A note is too long to import (max " +
        IMPORT_MAX_FIELD_CHARS + " characters).");
    }
  }

  // Labels: match by id, then by name, renaming on collision.
  const nameMap = new Map();
  for (const l of store.labels.values()) nameMap.set(l.name, l);
  const idMap = new Map();
  const newLabels = [];
  for (const [rawId, l] of labelEntries) {
    if (!l || typeof l !== "object") continue;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 0) continue;
    const name = clampText(l.name, IMPORT_MAX_LABEL_NAME).trim().replace(/\s+/g, " ");
    if (!name) continue;
    const existingById = store.labels.get(id);
    if (existingById) {
      if (name === existingById.name) { idMap.set(id, existingById.id); continue; }
      // Same id, different name: keep the existing label and add the imported
      // name under a fresh id (renamed if that name is already taken).
      let candidate = name, n = 2;
      while (nameMap.has(candidate)) candidate = name + " (" + n++ + ")";
      const created = { id: 0, name: candidate, hidden: false };
      newLabels.push(created);
      idMap.set(id, "@new:" + (newLabels.length - 1));
      continue;
    }
    const existingByName = nameMap.get(name);
    if (existingByName) {
      // Same name already here: point imported notes at the existing label.
      idMap.set(id, existingByName.id);
      continue;
    }
    const created = { id, name, hidden: l.hidden === true };
    newLabels.push(created);
    idMap.set(id, id);
  }
  for (const l of newLabels) {
    if (l.id === 0) { l.id = store.nextId++; }
    store.labels.set(l.id, l);
    nameMap.set(l.name, l);
    await db.put("labels", l);
  }
  // Resolve the "@new:index" indirections now that the new labels have their
  // real ids, so imported notes keep the labels that had to be renamed.
  for (const [oldId, val] of idMap) {
    if (typeof val === "string" && val.startsWith("@new:")) {
      const idx = Number(val.slice(5)); // "@new:" is 5 chars
      if (Number.isInteger(idx) && idx >= 0 && idx < newLabels.length) {
        idMap.set(oldId, newLabels[idx].id);
      } else {
        idMap.delete(oldId);
      }
    }
  }

  db.setMetaSafe("nextId", store.nextId);

  // Notes: skip or merge by id, reassign ranks that are missing or taken.
  const usedRanks = new Set();
  for (const n of store.notes.values()) usedRanks.add(n.rank);
  let inserted = 0, merged = 0, renamed = 0, skipped = 0;
  let lowest = null;
  for (const n of store.notes.values()) {
    const r = rankOf(n);
    if (lowest === null || r.compareTo(lowest) < 0) lowest = r;
  }
  for (const [rawId, s] of noteEntries) {
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 0) continue;
    let note;
    try { note = fromSurrogate(s); }
    catch (e) { skipped++; continue; }
    note.labels = note.labels.map((l) => idMap.get(l))
      .filter((l) => typeof l === "number");
    if (!note.rank || usedRanks.has(note.rank)) {
      note.rank = FractionalIndex.insert(null, lowest).toB64();
      lowest = rankOf(note);
    }
    usedRanks.add(note.rank);

    const existing = store.notes.get(id);
    if (!existing) {
      note.id = id === 0 ? store.nextId++ : id;
      if (note.id >= store.nextId) store.nextId = note.id + 1;
      store.notes.set(note.id, note);
      await db.put("notes", note);
      inserted++;
    } else if (existing.added === note.added && existing.modified === note.modified) {
      const mergedNote = {
        ...note,
        id: existing.id,
        // A reminder on either side wins; disagreeing reminders do not merge.
        reminder: existing.reminder && note.reminder &&
          existing.reminder.start !== note.reminder.start ? existing.reminder
          : note.reminder || existing.reminder,
        labels: [...new Set([...note.labels, ...existing.labels])],
      };
      store.notes.set(mergedNote.id, mergedNote);
      await db.put("notes", mergedNote);
      merged++;
    } else {
      note.id = store.nextId++;
      store.notes.set(note.id, note);
      await db.put("notes", note);
      renamed++;
    }
  }
  db.setMetaSafe("nextId", store.nextId);
  store.emit();
  return { inserted, merged, renamed, skipped, labels: newLabels.length, futureVersion: version > EXPORT_VERSION };
}

/* ------------------------------------------------------------------- toast */
let toastTimer = null;
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.add("open");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("open"), 2600);
}
function confirmDialog(title, text, okLabel) {
  return new Promise((resolve) => {
    $("cf-title").textContent = title;
    $("cf-text").textContent = text;
    $("cf-ok").textContent = okLabel || "Continue";
    const dlg = $("dlg-confirm");
    const done = (v) => {
      dlg.removeEventListener("close", onClose);
      if (dlg.open) dlg.close();
      $("cf-ok").onclick = null;
      $("cf-cancel").onclick = null;
      resolve(v);
    };
    // Escape closes a modal <dialog> natively and fires no click, which would
    // leave this promise pending forever and strand the awaiting caller.
    const onClose = () => done(false);
    dlg.addEventListener("close", onClose, { once: true });
    $("cf-ok").onclick = () => done(true);
    $("cf-cancel").onclick = () => done(false);
    dlg.showModal();
  });
}

/* ------------------------------------------------------------------ sheets */
let openSheet = null;
function showSheet(id) {
  closeSheet();
  openSheet = id;
  $("scrim").classList.add("open");
  $(id).classList.add("open");
  $(id).setAttribute("aria-hidden", "false");
  const menu = $("btn-menu");
  if (menu && id === "sheet-main") menu.setAttribute("aria-expanded", "true");
}
function closeSheet() {
  if (openSheet) {
    $(openSheet).classList.remove("open");
    $(openSheet).setAttribute("aria-hidden", "true");
  }
  openSheet = null;
  $("scrim").classList.remove("open");
  const menu = $("btn-menu");
  if (menu) menu.setAttribute("aria-expanded", "false");
}
