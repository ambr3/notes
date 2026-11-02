/* Tests for the pure logic in ../app.js.
   No dependencies, no test framework: run with `node test/logic.test.mjs`.

   The functions under test live in one big browser script, so they are pulled
   out of it by brace matching and evaluated in isolation with a small set of
   stubs. That keeps the tests honest about the real source rather than a copy. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { webcrypto } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
// The app is split across src/, so the tests read them all in load order.
const ORDER = ["core.js", "crypto.js", "recurrence.js", "i18n.js", "db.js",
  "store.js", "ui.js", "main.js"];
const source = ORDER.map((f) => readFileSync(join(here, "..", "src", f), "utf8")).join("\n");

/* Slice a top-level declaration out of the source. A one-line declaration,
   including an arrow returning an object literal, is taken verbatim. */
function pick(name) {
  const m = new RegExp("^(?:const |function |let |class |async function )" + name + "\\b", "m").exec(source);
  if (!m) throw new Error("not found in app.js: " + name);
  const start = m.index;
  const nl = source.indexOf("\n", start);
  const firstLine = source.slice(start, nl);
  if (firstLine.trimEnd().endsWith(";")) return firstLine;
  const brace = source.indexOf("{", start);
  if (brace < 0 || brace > nl) return firstLine;
  let depth = 0;
  for (let k = brace; k < source.length; k++) {
    if (source[k] === "{") depth++;
    else if (source[k] === "}") { depth--; if (depth === 0) return source.slice(start, k + 1); }
  }
  throw new Error("unbalanced braces: " + name);
}

const PARTS = [
  "FractionalIndex", "toB64", "fromB64", "fmtDate", "parseDate", "showDate",
  "blankMetadata", "listMetadata", "listItems", "notePreview", "asTextNote",
  "asListNote", "normalizeNote", "rankOf", "validRank", "clampText", "enumValue",
  "toSurrogate", "reminderToSurrogate", "fromSurrogate", "reminderFromSurrogate",
  "serialize", "BadData",
  "DAY_CODES", "DAY_NAMES", "DAY_SHORT", "REC", "formatRRule", "parseRRule",
  "nextOccurrence", "nthWeekdayOfMonth", "describeRecurrence",
  "BadReminder", "createReminder", "findNextReminder", "postponeReminder",
  "markReminderDone", "isOverdue",
  "toBase64", "fromBase64", "cryptoBox", "isEncryptedContainer",
  "MIN_PASSWORD_LENGTH", "PBKDF2_HASH", "ENCRYPTED_VERSION",
  "EXPORT_SALT_BYTES", "PBKDF2_ITERATIONS", "PBKDF2_MAX_ITERATIONS", "GCM_IV_BYTES",
  "IMPORT_MAX_FILE_BYTES", "IMPORT_MAX_NOTES", "IMPORT_MAX_LABELS",
  "IMPORT_MAX_TITLE", "IMPORT_MAX_CONTENT", "IMPORT_MAX_LABEL_NAME", "IMPORT_MAX_LABELS_PER_NOTE", "IMPORT_MAX_RANK_BYTES",
  "IMPORT_MAX_DRAWING_CHARS", "validDrawing",
];

const PRELUDE = `
const EXPORT_VERSION = 5;
const INT_MID = 0x80;
const STATUS = { ACTIVE: 0, ARCHIVED: 1, DELETED: 2 };
const PINNED = { CANT_PIN: 0, UNPINNED: 1, PINNED: 2 };
const TYPE = { TEXT: 0, LIST: 1, DRAW: 2 };
const BULLET = "\\u2022";
// Recurrence labels go through the i18n layer in the app; stub it here.
const tr = (k) => k;
const STORE = { notes: new Map(), labels: new Map(), nextId: 1 };
const store = STORE;
`;

const load = new Function(
  "TextEncoder", "TextDecoder", "crypto", "Blob", "BlobBuilder",
  "CompressionStream", "Response", "btoa", "atob",
  PRELUDE + PARTS.map(pick).join("\n") +
  "\nreturn {FractionalIndex,toB64,fromB64,fmtDate,parseDate,showDate,listItems,notePreview," +
  "asTextNote,asListNote,normalizeNote,rankOf,validRank,clampText,enumValue,toSurrogate," +
  "reminderToSurrogate,fromSurrogate,reminderFromSurrogate,serialize,formatRRule,parseRRule," +
  "nextOccurrence,describeRecurrence,createReminder,findNextReminder,postponeReminder," +
  "markReminderDone,isOverdue,toBase64,fromBase64,cryptoBox,isEncryptedContainer," +
  "listMetadata,blankMetadata,BadData,PBKDF2_ITERATIONS,PBKDF2_MAX_ITERATIONS," +
  "EXPORT_SALT_BYTES,GCM_IV_BYTES,IMPORT_MAX_NOTES,IMPORT_MAX_LABELS,IMPORT_MAX_DRAWING_CHARS,validDrawing,STORE};"
)(TextEncoder, TextDecoder, webcrypto, Blob, undefined, undefined, undefined, btoa, atob);

let passed = 0;
const failures = [];
function check(name, condition, detail) {
  if (condition) passed++;
  else failures.push(name + (detail ? " :: " + detail : ""));
}
const eq = (name, actual, expected) =>
  check(name, Object.is(actual, expected), "got " + JSON.stringify(actual) + ", want " + JSON.stringify(expected));

/* ------------------------------------------------------- fractional index */
{
  const FI = load.FractionalIndex;
  let prev = null;
  const ascending = [];
  for (let i = 0; i < 2000; i++) { prev = FI.insert(prev, null); ascending.push(prev); }
  let ordered = true;
  for (let i = 1; i < ascending.length; i++) {
    if (ascending[i - 1].compareTo(ascending[i]) >= 0) ordered = false;
  }
  check("fractional index stays strictly ordered over 2000 appends", ordered);
  eq("ranks are unique", new Set(ascending.map((x) => x.toB64())).size, 2000);

  let lo = null, hi = null;
  const interleaved = [];
  let boundsRespected = true;
  for (let i = 0; i < 500; i++) {
    const mid = FI.insert(lo, hi);
    interleaved.push(mid);
    if ((lo !== null && lo.compareTo(mid) >= 0)
        || (hi !== null && mid.compareTo(hi) >= 0)) boundsRespected = false;
    if (i % 2 === 0) lo = mid; else hi = mid;
  }
  check("interleaved insertion stays strictly between its bounds", boundsRespected);
  const asc = [...interleaved].sort((a, b) => a.compareTo(b));
  const desc = [...interleaved].sort((a, b) => b.compareTo(a));
  check("sorting is a total order", asc.every((x, i) => i === 0 || asc[i - 1].compareTo(x) < 0));
  check("descending is the exact reverse", desc.every((x, i) => i === 0 || desc[i - 1].compareTo(x) > 0));

  let acc = FI.INITIAL;
  for (let i = 0; i < 10; i++) acc = acc.append();
  check("nth(n) matches n appends", FI.nth(10).equals(acc));

  const anchor = FI.nth(5);
  check("insert(x, x) returns x", FI.insert(anchor, anchor).equals(anchor));

  let roundTrip = true;
  for (const f of ascending.slice(0, 300)) {
    const b64 = f.toB64();
    if (b64.includes("=")) roundTrip = false;
    const back = load.FractionalIndex.fromB64(b64);
    if (!f.equals(back)) roundTrip = false;
  }
  check("base64 round trip is byte exact and unpadded", roundTrip);
}

/* ---------------------------------------------------------- date handling */
{
  const re = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  let good = true;
  for (let i = 0; i < 500; i++) {
    const ms = Math.floor(Math.random() * 4e12);
    const s = load.fmtDate(ms);
    if (!re.test(s)) good = false;
    if (Math.abs(load.parseDate(s) - ms) > 1) good = false;
  }
  check("UTC date format matches the Android pattern and round trips", good);
  eq("epoch formats correctly", load.fmtDate(0), "1970-01-01T00:00:00.000Z");

  // A bare date must not slip through Date.parse, which reads it as UTC and
  // shifts the day for anyone west of Greenwich.
  const local = new Date(2025, 0, 10, 0, 0, 0, 0);
  eq("date-only input is read as local midnight", load.parseDate("2025-01-10"), local.getTime());

  let throws = false;
  try { load.parseDate("not a date"); } catch (e) { throws = e instanceof Error; }
  check("unparseable dates throw", throws);
}

/* ------------------------------------------------------------- recurrence */
{
  const parse = load.parseRRule, fmt = load.formatRRule, next = load.nextOccurrence;

  const daily = parse(fmt({ freq: "DAILY", interval: 1 }));
  check("daily rule survives a format/parse round trip", daily.freq === "DAILY" && daily.interval === 1);
  eq("interval is preserved", parse(fmt({ freq: "DAILY", interval: 3 })).interval, 3);
  eq("weekly byday survives", parse(fmt({ freq: "WEEKLY", interval: 1, byday: [1, 3, 5] })).byday.join(), "1,3,5");
  eq("biweekly survives", parse(fmt({ freq: "WEEKLY", interval: 2, byday: [0, 6] })).interval, 2);
  eq("monthly bymonthday survives", parse(fmt({ freq: "MONTHLY", interval: 1, bymonthday: 15 })).bymonthday, 15);
  const nth = parse(fmt({ freq: "MONTHLY", interval: 1, byday: 5, nth: 2 }));
  check("monthly nth-weekday survives", nth.byday === 5 && nth.nth === 2);
  eq("yearly survives", parse(fmt({ freq: "YEARLY", interval: 1, bymonth: 12, bymonthday: 25 })).bymonth, 12);

  eq("null recurrence formats to null", fmt(null), null);
  eq("empty rule parses to null", parse(""), null);
  eq("unknown FREQ is rejected", parse("FREQ=NONSENSE"), null);

  // Daily must keep the time of day and step whole days.
  const start = new Date(2025, 0, 15, 9, 30, 0, 0).getTime();
  const d = new Date(next(parse("FREQ=DAILY;INTERVAL=2"), start, start));
  check("daily +2 keeps its time of day", d.getDate() === 17 && d.getHours() === 9 && d.getMinutes() === 30,
    d.toString());

  // Weekly on named days must land on those days, walking the week in order.
  const wStart = new Date(2025, 0, 6, 8, 0, 0, 0).getTime();
  const weekly = parse("FREQ=WEEKLY;BYDAY=MO,WE,FR");
  let cursor = wStart;
  const days = [];
  for (let i = 0; i < 6; i++) { cursor = next(weekly, wStart, cursor); days.push(new Date(cursor).getDay()); }
  check("weekly lands only on the listed days", days.every((d) => [1, 3, 5].includes(d)), days.join());
  eq("first occurrence after the cursor skips the cursor itself", days[0], 3);

  // Saturday+Sunday must fire Saturday first in a Monday-anchored week.
  const satSunStart = new Date(2026, 2, 14, 15, 45, 0, 0).getTime();
  const satSun = parse("FREQ=WEEKLY;BYDAY=SA,SU");
  const first = new Date(next(satSun, satSunStart, satSunStart - 1));
  check("Sat+Sun fires on the Saturday", first.getDay() === 6 && first.getDate() === 14, first.toString());

  // A day that some months lack is skipped, not clamped.
  const jan31 = new Date(2025, 0, 31, 12, 0, 0, 0).getTime();
  const feb = new Date(next(parse("FREQ=MONTHLY;BYMONTHDAY=31"), jan31,
    new Date(2025, 0, 31, 13, 0, 0).getTime()));
  check("Jan 31 skips to Mar 31", feb.getMonth() === 2 && feb.getDate() === 31, feb.toString());

  // A series that can never occur must terminate rather than hang.
  eq("an impossible rule yields null", next(parse("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30"), jan31, jan31), null);

  // These labels go through the i18n layer, so the stubbed tr() returns the
  // key. Asserting the key proves the label is translated rather than hardcoded.
  eq("weekday label is translated",
    load.describeRecurrence(parse("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR")), "recurrence_weekdays");
  eq("weekend label is translated",
    load.describeRecurrence(parse("FREQ=WEEKLY;BYDAY=SA,SU")), "recurrence_weekends");
  eq("seven days reads as daily",
    load.describeRecurrence(parse("FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA")), "recurrence_daily");
}

/* -------------------------------------------------------- reminder model */
{
  const create = load.createReminder, advance = load.findNextReminder;
  const once = create(new Date(2026, 0, 5, 9, 0, 0).getTime(), null);
  check("a one-off reminder points at its start", once.next === once.start && once.count === 1);
  check("a one-off never advances", advance(once) === once);
  check("overdue is detected", load.isOverdue({ ...once, next: once.next - 1 }, once.next) === true);
  check("a done reminder is not overdue", load.isOverdue({ ...once, done: true }, once.next) === false);
  check("markAsDone does not mutate its input", load.markReminderDone(once).done === true && once.done === false);

  let why = "";
  try { load.postponeReminder({ ...once, done: true }, once.next + 86400000); } catch (e) { why = "done"; }
  eq("cannot postpone a done reminder", why, "done");
  why = "";
  try { load.postponeReminder(once, once.next); } catch (e) { why = "later"; }
  eq("postponing must move forward", why, "later");
  why = "";
  try { load.postponeReminder(create(once.start, load.parseRRule("FREQ=DAILY")), once.next + 1); } catch (e) { why = "recur"; }
  eq("cannot postpone a recurring reminder", why, "recur");

  // A recurring reminder must not start in the past, at any millisecond.
  let safe = true;
  for (const ms of [0, 1, 250, 450, 999]) {
    const start = new Date(2026, 5, 10, 9, 15, 30, ms).getTime();
    const r = create(start, load.parseRRule("FREQ=DAILY"));
    if (r.next < r.start) safe = false;
    const nextR = advance(r);
    if (!(nextR.next > r.next) || nextR.count !== 2) safe = false;
  }
  check("first occurrence never precedes the series start", safe);
}

/* ------------------------------------------------ export / import schema */
{
  const note = {
    id: 1, type: 0, title: "Hello", content: "World", metadata: { kind: "blank" },
    added: Date.UTC(2024, 0, 2, 3, 4, 5, 6), modified: Date.UTC(2024, 0, 2, 3, 4, 5, 7),
    rank: "gA", status: 0, pinned: 1, labels: [7, 8], reminder: null,
  };
  const s = load.toSurrogate(note);
  eq("added is a UTC string", s.added, "2024-01-02T03:04:05.006Z");
  eq("text metadata is the string \"blank\"", s.metadata, '"blank"');
  eq("rank is kept", s.rank, "gA");
  check("a null reminder is omitted", !("reminder" in s));

  const listNote = { ...note, id: 2, type: 1, content: "a\nb\nc",
    metadata: { kind: "list", checked: [true, false, true] } };
  eq("list metadata is a JSON-encoded checked array",
    load.toSurrogate(listNote).metadata, '{"checked":[true,false,true]}');

  load.STORE.notes.clear();
  load.STORE.labels.clear();
  load.STORE.notes.set(1, note);
  load.STORE.labels.set(7, { id: 7, name: "work", hidden: false });
  const doc = JSON.parse(load.serialize(load.STORE));
  eq("document version is 5", doc.version, 5);
  check("notes are keyed by id", doc.notes["1"].title === "Hello");
  check("label id is not serialized", !("id" in doc.labels["7"]));
  eq("label fields are exactly name and hidden",
    Object.keys(doc.labels["7"]).sort().join(), "hidden,name");

  const back = load.fromSurrogate(doc.notes["1"]);
  check("a text note round trips", back.title === "Hello" && back.content === "World");
  check("timestamps round trip", back.added === note.added && back.modified === note.modified);
  eq("labels round trip", back.labels.join(), "7,8");

  const bl = load.fromSurrogate(load.toSurrogate(listNote));
  check("list metadata round trips", bl.metadata.kind === "list"
    && bl.metadata.checked.join() === "true,false,true", bl.metadata.checked.join());
  eq("listItems yields every row", load.listItems(bl).length, 3);

  const png = "data:image/png;base64,iVBORw0KGgo=";
  const drawSurrogate = (data) => ({ type: 2, title: "", content: "", added: 0, modified: 0,
    metadata: JSON.stringify({ kind: "draw", data }), status: 0, pinned: 1, labels: [] });
  eq("an imported PNG drawing is kept", load.fromSurrogate(drawSurrogate(png)).metadata.data, png);
  eq("an imported non-PNG drawing is dropped",
    load.fromSurrogate(drawSurrogate("data:text/html;base64,PGgxPg==")).metadata.data, "");
  eq("an imported drawing with bad characters is dropped",
    load.fromSurrogate(drawSurrogate("data:image/png;base64,AB<script>")).metadata.data, "");
  eq("an oversized imported drawing is dropped",
    load.validDrawing("data:image/png;base64," + "A".repeat(load.IMPORT_MAX_DRAWING_CHARS)), "");

  // list <-> text conversion, matching the Kotlin behaviour.
  const asTxt = load.asTextNote({ ...note, type: 1, content: "one\ntwo",
    metadata: { kind: "list", checked: [true, false] } });
  eq("list becomes bulleted text", asTxt.content, "• one\n• two");
  eq("text drops the list metadata", asTxt.metadata.kind, "blank");
  eq("checked items are dropped when asked",
    load.asTextNote({ ...note, type: 1, content: "one\ntwo",
      metadata: { kind: "list", checked: [true, false] } }, false).content, "• two");
  const asList = load.asListNote({ ...note, content: "• x\ny" });
  eq("bullets are stripped when converting to a list", asList.content, "x\ny");
  eq("converted list items start unchecked", asList.metadata.checked.join(), "false,false");

  // The model invariants the Room entity enforces.
  eq("text notes get blank metadata",
    load.normalizeNote({ type: 0, metadata: { kind: "list", checked: [true] }, status: 0, pinned: 1 }).metadata.kind, "blank");
  eq("archived notes cannot be pinned",
    load.normalizeNote({ type: 0, metadata: { kind: "blank" }, status: 1, pinned: 2 }).pinned, 0);
  eq("active notes must be pinnable",
    load.normalizeNote({ type: 0, metadata: { kind: "blank" }, status: 0, pinned: 0 }).pinned, 1);
  eq("checked state is padded to the item count",
    load.normalizeNote({ type: 1, metadata: { kind: "list", checked: [true] }, status: 0, pinned: 1, content: "a\nb" })
      .metadata.checked.length, 2);
  eq("checked state is truncated to the item count",
    load.normalizeNote({ type: 1, metadata: { kind: "list", checked: [true, true, true] }, status: 0, pinned: 1, content: "a" })
      .metadata.checked.length, 1);

  // Encrypted container shape.
  const start = new Date(2026, 2, 14, 15, 45, 0, 0).getTime();
  const recurring = load.createReminder(start, load.parseRRule("FREQ=WEEKLY;BYDAY=SA,SU"));
  const rs = load.reminderToSurrogate(recurring);
  eq("reminder recurrence is an RRULE string", rs.recurrence, "FREQ=WEEKLY;BYDAY=SU,SA");
  check("reminder dates are UTC strings", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(rs.start));
  const rb = load.reminderFromSurrogate(rs);
  check("reminder round trips", rb.next === recurring.next &&
    rb.recurrence.byday.join() === "0,6");
  eq("an absent reminder is null", load.reminderFromSurrogate(null), null);
  eq("an absent recurrence is null",
    load.reminderFromSurrogate({ start: load.fmtDate(start), next: load.fmtDate(start) }).recurrence, null);

  let msg = "";
  try {
    load.reminderFromSurrogate({ start: load.fmtDate(start), next: load.fmtDate(start), recurrence: "FREQ=NEVER" });
  } catch (e) { msg = e.message; }
  check("an unsupported recurrence is rejected", /unsupported recurrence/.test(msg), msg);
}

/* ------------------------------------------------------- input validation */
{
  eq("a valid rank is returned unchanged", load.validRank("gA"), "gA");
  eq("an empty rank is rejected", load.validRank(""), null);
  eq("a rank with illegal base64 is rejected", load.validRank("gA!!"), null);
  eq("a rank of the wrong type is rejected", load.validRank(123), null);
  eq("a rank that does not start at the midpoint is rejected", load.validRank("AAAA"), null);
  eq("text is capped", load.clampText("x".repeat(100), 10).length, 10);
  eq("non-strings collapse safely", load.clampText(null, 10), "");
  const table = { ACTIVE: 0, ARCHIVED: 1, DELETED: 2 };
  eq("a member of the enum passes through", load.enumValue(1, table, 0), 1);
  eq("an unknown enum value falls back", load.enumValue(9, table, 0), 0);
  eq("a non-numeric enum value falls back", load.enumValue("1", table, 0), 0);
}

/* ------------------------------------------------------------- encryption */
{
  const box = load.cryptoBox;
  check("WebCrypto is available", box.supported === true);
  const plain = JSON.stringify({ version: 5, notes: { 1: { title: "secret" } }, labels: {} });
  const sealed = await box.encrypt(plain, "hunter2");
  eq("salt is 128 bytes", load.fromBase64(sealed.salt).length, load.EXPORT_SALT_BYTES);
  eq("nonce is 12 bytes", load.fromBase64(sealed.nonce).length, load.GCM_IV_BYTES);
  check("nothing is padded", !/[=]/.test(sealed.salt + sealed.nonce + sealed.ciphertext));
  check("nothing is line wrapped", !/\n/.test(sealed.salt + sealed.nonce + sealed.ciphertext));
  eq("encrypt/decrypt round trips", await box.decrypt(sealed, "hunter2"), plain);

  let msg = "";
  try { await box.decrypt(sealed, "wrong"); } catch (e) { msg = e.message; }
  check("a wrong password is rejected", /Wrong password/.test(msg), msg);

  const tampered = { ...sealed, ciphertext: sealed.ciphertext.slice(0, -6) + "AAAAAA" };
  msg = "";
  try { await box.decrypt(tampered, "hunter2"); } catch (e) { msg = e.message; }
  check("tampered ciphertext fails the GCM tag", /Wrong password/.test(msg), msg);

  const twice = await box.encrypt(plain, "hunter2");
  check("salt and nonce are fresh each time",
    twice.salt !== sealed.salt && twice.ciphertext !== sealed.ciphertext);
  eq("iterations are 210000", load.PBKDF2_ITERATIONS, 210000);
  msg = "";
  try {
    await box.deriveKey("hunter2", new Uint8Array(16), {
      iterations: load.PBKDF2_MAX_ITERATIONS + 1,
    });
  } catch (e) { msg = e.message; }
  check("excessive PBKDF2 iterations are rejected", /too many key-derivation rounds/.test(msg), msg);

  check("an encrypted container is recognised", load.isEncryptedContainer(sealed));
  check("a plain export is not", !load.isEncryptedContainer(JSON.parse(plain)));
  check("null is not a container", !load.isEncryptedContainer(null));
  check("a document with notes is not a container",
    !load.isEncryptedContainer({ notes: {}, ciphertext: "x", salt: "y", nonce: "z" }));
}

/* ------------------------------------------------------------------ report */
if (failures.length) {
  console.error("FAILED " + failures.length + " of " + (passed + failures.length) + " checks:\n");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("all " + passed + " checks passed");
