/* ------------------------------------------------------------- recurrence
   The Android app stores recurrence as an RRULE string, produced and consumed
   by RRuleFormatter. These helpers cover the subset that formatter emits so
   exports stay importable by the Android app.

   Occurrences are computed in local time, matching RecurrenceFinder, which
   works on a Calendar in the device time zone. Instants are stored in UTC. */
const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const REC = {
  daily: (interval = 1) => ({ freq: "DAILY", interval }),
  weekly: (days, interval = 1) => ({ freq: "WEEKLY", interval, byday: days.slice().sort((a, b) => a - b) }),
  monthlyDate: (day, interval = 1) => ({ freq: "MONTHLY", interval, bymonthday: day }),
  monthlyWeekday: (ordinal, day, interval = 1) =>
    ({ freq: "MONTHLY", interval, byday: day, nth: ordinal }),
  yearly: (month, day, interval = 1) => ({ freq: "YEARLY", interval, bymonth: month, bymonthday: day }),
};

function formatRRule(r) {
  if (!r) return null;
  const parts = ["FREQ=" + r.freq];
  if (r.interval && r.interval !== 1) parts.push("INTERVAL=" + r.interval);
  if (r.freq === "WEEKLY" && r.byday && r.byday.length) {
    parts.push("BYDAY=" + r.byday.map((d) => DAY_CODES[d]).join(","));
  } else if (r.freq === "MONTHLY" && r.byday !== undefined && r.byday !== null) {
    parts.push("BYDAY=" + (r.nth || 1) + DAY_CODES[r.byday]);
  } else if (r.freq === "MONTHLY" && r.bymonthday) {
    parts.push("BYMONTHDAY=" + r.bymonthday);
  }
  if (r.freq === "YEARLY") {
    if (r.bymonth) parts.push("BYMONTH=" + r.bymonth);
    if (r.bymonthday) parts.push("BYMONTHDAY=" + r.bymonthday);
  }
  return parts.join(";");
}

function parseRRule(s) {
  if (!s) return null;
  // Collected first and interpreted after, because the meaning of BYDAY depends
  // on FREQ and an RRULE does not require FREQ to appear first.
  const parts = {};
  for (const tok of String(s).split(";")) {
    const i = tok.indexOf("=");
    if (i === -1) continue;
    parts[tok.slice(0, i).toUpperCase()] = tok.slice(i + 1);
  }
  const freq = (parts.FREQ || "").toUpperCase();
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null;
  const out = {
    freq,
    interval: Math.max(1, parseInt(parts.INTERVAL, 10) || 1),
    byday: null, bymonthday: null, bymonth: null, nth: null,
  };
  if (parts.BYDAY) {
    const codes = parts.BYDAY.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
    if (freq === "WEEKLY") {
      const days = [];
      for (const c of codes) {
        const d = DAY_CODES.indexOf(c.slice(-2));
        if (d >= 0) days.push(d);
      }
      out.byday = days.sort((a, b) => a - b);
    } else {
      // Monthly-by-weekday form: an optional ordinal then a day code.
      const m = /^([+-]?\d+)?([A-Z]{2})$/.exec(codes[0] || "");
      if (m) {
        out.nth = m[1] ? parseInt(m[1], 10) : 1;
        const d = DAY_CODES.indexOf(m[2]);
        // A two-letter code that is not a weekday leaves byday null, which the
        // recurrence code reads as "no weekday given" rather than day -1.
        out.byday = d >= 0 ? d : null;
      }
    }
  }
  if (parts.BYMONTHDAY) {
    const n = parseInt(parts.BYMONTHDAY, 10);
    if (Number.isFinite(n)) out.bymonthday = n;
  }
  if (parts.BYMONTH) {
    const n = parseInt(parts.BYMONTH, 10);
    if (Number.isFinite(n)) out.bymonth = n;
  }
  return out;
}

/* Nth weekday of a month, e.g. the 2nd Friday. Returns null when the month has
   no such weekday, which is why month lengths need checking. */
function nthWeekdayOfMonth(year, month, day, nth) {
  const first = new Date(year, month, 1);
  const offset = (day - first.getDay() + 7) % 7;
  const d = new Date(year, month, 1 + offset + (nth - 1) * 7);
  return d.getMonth() === month ? d : null;
}

/* First occurrence strictly after `after`. `from` is the series start, whose
   time of day every occurrence inherits. Returns an epoch ms, or null. */
function nextOccurrence(rec, from, after, limitYears = 12) {
  if (!rec || !rec.freq) return null;
  const step = Math.max(1, rec.interval || 1);
  const base = new Date(from);
  // Milliseconds must be carried through, otherwise the first occurrence can
  // land up to 999ms before the series start and count as already overdue.
  const withTime = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(),
    base.getHours(), base.getMinutes(), base.getSeconds(), base.getMilliseconds()).getTime();
  const horizon = new Date(after).getFullYear() + limitYears;
  let guard = 0;
  const tick = () => { if (++guard > 20000) throw new Error("recurrence search exhausted"); };

  if (rec.freq === "DAILY") {
    let d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    while (d.getFullYear() <= horizon) {
      const ms = withTime(d);
      if (ms > after) return ms;
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + step);
      tick();
    }
    return null;
  }

  if (rec.freq === "WEEKLY") {
    const days = rec.byday && rec.byday.length ? rec.byday : [base.getDay()];
    // Within a Monday-anchored week the days must be walked in calendar order.
    // Sorting by JS day index would put Sunday before Saturday and fire a
    // Sat+Sun rule on the wrong day of the first week.
    const ordered = days.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    // Anchor on Monday so INTERVAL counts whole weeks.
    const bs = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    const anchor = (d) => d.getDate() - ((d.getDay() + 6) % 7);
    const weekStart = new Date(bs.getFullYear(), bs.getMonth(), anchor(bs));
    let w = new Date(weekStart);
    while (w.getFullYear() <= horizon) {
      const monday = w.getDate();
      for (const day of ordered) {
        // `day` is a JS day of week where 0 is Sunday, so it needs converting
        // to an offset from the Monday that starts the week.
        const ms = withTime(new Date(w.getFullYear(), w.getMonth(), monday + ((day + 6) % 7)));
        if (ms > after) return ms;
      }
      w = new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7 * step);
      tick();
    }
    return null;
  }

  if (rec.freq === "MONTHLY") {
    let m = new Date(base.getFullYear(), base.getMonth(), 1);
    while (m.getFullYear() <= horizon) {
      const y = m.getFullYear(), mo = m.getMonth();
      let day = null;
      if (rec.byday !== undefined && rec.byday !== null) {
        const d = nthWeekdayOfMonth(y, mo, rec.byday, rec.nth || 1);
        if (d) day = d.getDate();
      } else {
        const dom = rec.bymonthday || base.getDate();
        // Months lacking that day are skipped rather than clamped, which is
        // what an RRULE BYMONTHDAY means.
        if (new Date(y, mo, dom).getMonth() === mo) day = dom;
      }
      if (day !== null) {
        const ms = withTime(new Date(y, mo, day));
        if (ms > after) return ms;
      }
      m = new Date(y, mo + step, 1);
      tick();
    }
    return null;
  }

  if (rec.freq === "YEARLY") {
    let y = base.getFullYear();
    const mo = (rec.bymonth || base.getMonth() + 1) - 1;
    const dom = rec.bymonthday || base.getDate();
    while (y <= horizon) {
      if (new Date(y, mo, dom).getMonth() === mo) {
        const ms = withTime(new Date(y, mo, dom));
        if (ms > after) return ms;
      }
      y += step;
      tick();
    }
    return null;
  }
  return null;
}

/* Human readable summary for the note list and editor. */
function describeRecurrence(rec) {
  if (!rec) return "";
  switch (rec.freq) {
    case "DAILY": return rec.interval === 1 ? "Daily" : "Every " + rec.interval + " days";
    case "WEEKLY":
      if (rec.interval !== 1) return "Every " + rec.interval + " weeks";
      if (rec.byday && rec.byday.length) {
        if (rec.byday.length === 7) return tr("recurrence_daily");
        if (rec.byday.length === 5 && !rec.byday.includes(0) && !rec.byday.includes(6)) return tr("recurrence_weekdays");
        if (rec.byday.length === 2 && rec.byday.includes(0) && rec.byday.includes(6)) return tr("recurrence_weekends");
        return rec.byday.map((d) => DAY_SHORT[d]).join(", ");
      }
      return "Weekly";
    case "MONTHLY":
      if (rec.byday !== undefined && rec.byday !== null) {
        const ord = rec.nth || 1;
        const name = ["", "first", "second", "third", "fourth", "last"][ord] || ord + "th";
        return "Monthly on the " + name + " " + DAY_NAMES[rec.byday];
      }
      return rec.interval === 1 ? "Monthly" : "Every " + rec.interval + " months";
    case "YEARLY": return rec.interval === 1 ? "Yearly" : "Every " + rec.interval + " years";
    default: return "Repeats";
  }
}

/* ----------------------------------------------------------- reminder model
   Mirrors the Android Reminder entity: an instant, an optional recurrence,
   how many times it has fired, and whether the user marked it done. */
class BadReminder extends Error {}

function createReminder(start, recurrence) {
  const rec = recurrence || null;
  let next = start;
  if (rec) {
    // A recurring reminder must land on a real occurrence.
    const found = nextOccurrence(rec, start, start - 1);
    if (!found) throw new BadReminder("Recurring reminder has no events.");
    next = found;
  }
  return { start, recurrence: rec, next, count: 1, done: false };
}

/* Advance a recurring reminder. A non-recurring one returns itself, which is
   how the Android code detects an exhausted series. */
function findNextReminder(r) {
  if (!r.recurrence) return r;
  const found = nextOccurrence(r.recurrence, r.start, r.next);
  if (!found) return r;
  return { ...r, next: found, count: r.count + 1, done: false };
}

function postponeReminder(r, when) {
  if (r.recurrence) throw new BadReminder("Cannot postpone a recurring reminder.");
  if (r.done) throw new BadReminder("Cannot postpone a reminder marked done.");
  if (!(when > r.next)) throw new BadReminder("Postponed time must be later.");
  return { ...r, next: when };
}
const markReminderDone = (r) => ({ ...r, done: true });

const isOverdue = (r, now) => !r.done && r.next <= now;
const reminderKey = (noteId, next) => noteId + "@" + next;

function describeReminder(r) {
  const when = showDate(r.next);
  if (r.done) return when + " · " + tr("reminder_done");
  if (isOverdue(r, Date.now())) return tr("reminder_overdue") + " · " + when;
  const rec = describeRecurrence(r.recurrence);
  return rec ? when + " · " + rec : when;
}
