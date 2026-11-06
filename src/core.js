"use strict";
/* ============================================================================
   Seclusa Notes — core
   Storage: IndexedDB. Backup: a file the user shares or downloads.
   Notes JSON schema version 5 (compatible with Another notes app exports).
   ========================================================================== */

const EXPORT_VERSION = 5;
const FIRST_VERSION = 3;
const DB_NAME = "another-notes-app";

const STATUS = { ACTIVE: 0, ARCHIVED: 1, DELETED: 2 };
const PINNED = { CANT_PIN: 0, UNPINNED: 1, PINNED: 2 };
const TYPE = { TEXT: 0, LIST: 1, DRAW: 2 };
const SORT_FIELD = { ADDED: 0, MODIFIED: 1, TITLE: 2, CUSTOM: 3 };
const SORT_DIR = { ASC: 0, DESC: 1 };
const BULLET = "•";

const $ = (id) => document.getElementById(id);

/* ---------------------------------------------------------------- base64 */
function toB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/=+$/, "");
}
function fromB64(str) {
  // Coerced rather than assumed: a stored rank may be a non-string if the
  // database was tampered with, and this must not throw on the way in.
  str = (str == null ? "" : String(str)).trim().replace(/\s+/g, "");
  if (!str) return new Uint8Array(0);
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ------------------------------------------------------- dates as strings */
/* The Android app stores dates as "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'" in UTC. */
function fmtDate(ms) {
  const d = new Date(ms);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return (
    p(d.getUTCFullYear(), 4) + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate()) +
    "T" + p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + ":" + p(d.getUTCSeconds()) +
    "." + p(d.getUTCMilliseconds(), 3) + "Z"
  );
}
/* Accepts the Android UTC format, an ISO instant, or a bare yyyy-MM-dd.
   A date-only string is read as local midnight rather than UTC midnight:
   Date.parse("2026-10-10") is spec'd as UTC, which lands on the previous day
   for anyone west of Greenwich. */
function parseDate(str) {
  if (typeof str === "number") return Number.isFinite(str) ? str : 0;
  if (typeof str !== "string") throw new BadData("unparseable date");
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str.trim());
  if (bare) {
    const y = Number(bare[1]), mo = Number(bare[2]), d = Number(bare[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) throw new BadData("unparseable date: " + str);
    const local = new Date(y, mo - 1, d).getTime();
    if (Number.isNaN(local)) throw new BadData("unparseable date: " + str);
    return local;
  }
  const ms = Date.parse(str);
  if (Number.isNaN(ms)) throw new BadData("unparseable date: " + str);
  return ms;
}
function showDate(ms) {
  // `!ms` would swallow a legitimate 0 (the epoch), so test the type instead.
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const loc = (typeof i18n !== "undefined" && i18n.tag) || undefined;
  const time = d.toLocaleTimeString(loc, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return time;
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString(loc, {
    day: "numeric", month: "short", year: sameYear ? undefined : "numeric",
  }) + " " + time;
}

class BadData extends Error {}

/* ------------------------------------------------------- fractional index
   A port of the Android FractionalIndex: an order-preserving byte string that
   lets a note be dropped between two others without renumbering the list.   */
const INT_MID = 0x80;

class FractionalIndex {
  constructor(bytes) {
    this.data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (this.data.length === 0) this.data = new Uint8Array([INT_MID]);
  }
  static get INITIAL() { return new FractionalIndex(new Uint8Array([INT_MID])); }
  get bytes() { return this.data; }
  get size() { return this.data.length; }
  get intLength() {
    return Math.abs(this.data[0] - INT_MID) + 1;
  }
  get sign() { return Math.sign(this.data[0] - INT_MID); }

  _intOp(increment, shrinkIf, lowest) {
    const len = this.intLength;
    const out = this.data.slice(0, len);
    for (let i = out.length - 1; i >= 0; i--) {
      out[i] = (out[i] + increment) & 0xff;
      if (i > 0 && out[i] !== lowest) return new FractionalIndex(out);
    }
    if (shrinkIf) {
      const shrunk = new Uint8Array(out.length - 1);
      for (let i = 0; i < shrunk.length; i++) shrunk[i] = i === 0 ? out[0] : out[i + 1];
      return new FractionalIndex(shrunk);
    }
    const grown = new Uint8Array(out.length + 1);
    for (let i = 0; i < grown.length; i++) {
      grown[i] = i === 0 ? out[0] : i === 1 ? lowest : out[i - 1];
    }
    return new FractionalIndex(grown);
  }
  append() { return this._intOp(1, this.sign < 0, 0x00); }
  prepend() { return this._intOp(-1, this.sign > 0, 0xff); }

  static insert(low, high) {
    if (!low && !high) return FractionalIndex.INITIAL;
    if (!low) return high.prepend();
    if (!high) return low.append();
    if (low.equals(high)) return low;

    const out = [];
    const n = Math.max(low.size, high.size);
    for (let i = 0; i <= n; i++) {
      const a = i < low.size ? low.data[i] : 0;
      const b = i < high.size ? high.data[i] : 0x100;
      if (Math.abs(a - b) < 2) {
        out.push(a & 0xff);
      } else {
        out.push(Math.floor((a + b) / 2) & 0xff);
        break;
      }
    }
    // Complete the integer part so the value stays valid.
    const need = Math.abs(out[0] - INT_MID) + 1;
    while (out.length < need) out.push(INT_MID);
    return new FractionalIndex(new Uint8Array(out));
  }

  static nth(n) {
    let idx = FractionalIndex.INITIAL;
    if (n < 0) for (let i = 0; i < -n; i++) idx = idx.prepend();
    else for (let i = 0; i < n; i++) idx = idx.append();
    return idx;
  }
  compareTo(other) {
    const n = Math.max(this.size, other.size);
    for (let i = 0; i < n; i++) {
      const a = i < this.size ? this.data[i] : -1;
      const b = i < other.size ? other.data[i] : -1;
      if (a !== b) return a < b ? -1 : 1;
    }
    return 0;
  }
  equals(other) {
    if (!other || !(other instanceof FractionalIndex)) return false;
    return this.data.length === other.data.length &&
      this.data.every((v, i) => v === other.data[i]);
  }
  toB64() { return toB64(this.data); }
  static fromB64(str) { return new FractionalIndex(fromB64(str)); }
}

/* Reads a stored rank defensively. The sort comparator runs on every render,
   so a note holding an undecodable rank must not be able to throw out of it
   and leave the list blank. */
function rankOf(note) {
  try {
    return FractionalIndex.fromB64(note.rank);
  } catch (e) {
    return FractionalIndex.INITIAL;
  }
}

/* ------------------------------------------------------------ note helpers */
function blankMetadata() { return { kind: "blank" }; }
function listMetadata(checked) { return { kind: "list", checked: checked || [] }; }
function listItems(note) {
  if (note.type !== TYPE.LIST) return [];
  // Rendered straight from the store, so this must not assume normalizeNote ran.
  const checked = Array.isArray(note.metadata?.checked) ? note.metadata.checked : [];
  const lines = String(note.content || "").split("\n");
  if (lines.length === 1 && lines[0] === "" && checked.length === 0) return [];
  return lines.map((text, i) => ({
    // Do not trim: trimming while typing eats trailing spaces and can reshuffle rows.
    content: text,
    checked: checked[i] === true,
  }));
}
function notePreview(note) {
  if (note.type === TYPE.DRAW) return "[Drawing]";
  if (note.type === TYPE.LIST) return listItems(note)
    .map((it) => (it.checked ? "[x] " : "[ ] ") + it.content)
    .join("\n");
  return note.content;
}
function asTextNote(note, keepChecked = true) {
  if (note.type === TYPE.TEXT) return note;
  const items = listItems(note);
  const kept = items.filter((it) => keepChecked || !it.checked);
  const allBlank = items.every((it) => it.content === "");
  const content = allBlank ? "" : kept.map((it) => BULLET + " " + it.content).join("\n");
  return { ...note, type: TYPE.TEXT, content, metadata: blankMetadata() };
}
function asListNote(note) {
  if (note.type === TYPE.LIST) return note;
  const items = note.content === "" ? [] : note.content.split("\n").map((text) => {
    const trimmed = text.trim();
    return trimmed.startsWith(BULLET) ? trimmed.slice(BULLET.length).trim() : trimmed;
  });
  return { ...note, type: TYPE.LIST, content: items.join("\n"),
    metadata: listMetadata(items.map(() => false)) };
}
/* Same invariant the Android model enforces: type must match its metadata. */
function normalizeNote(note) {
  if (!note.metadata || typeof note.metadata !== "object") note.metadata = blankMetadata();
  if (typeof note.title !== "string") note.title = "";
  if (typeof note.content !== "string") note.content = "";
  if (note.type === TYPE.TEXT && note.metadata.kind !== "blank") {
    note.metadata = blankMetadata();
  }
  if (note.type === TYPE.LIST) {
    const items = note.content === "" ? [] : note.content.split("\n");
    // A list note can reach normalizeNote with blank metadata, for example from
    // an import that pairs type LIST with metadata "blank". Reading .checked off
    // that would throw, so the array is validated rather than assumed.
    const existing = Array.isArray(note.metadata.checked) ? note.metadata.checked : [];
    const checked = existing.slice(0, items.length);
    while (checked.length < items.length) checked.push(false);
    note.metadata = listMetadata(checked);
  }
  if (note.type === TYPE.DRAW && note.metadata.kind !== "draw") {
    note.metadata = { kind: "draw", data: "" };
  }
  if (!Array.isArray(note.labels)) note.labels = [];
  if (note.status !== STATUS.ACTIVE) note.pinned = PINNED.CANT_PIN;
  else if (note.pinned === PINNED.CANT_PIN) note.pinned = PINNED.UNPINNED;
  return note;
}
