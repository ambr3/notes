/* ------------------------------------------------------------- list render */
function svgIcon(className, paths) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  if (className) svg.setAttribute("class", className);
  for (const d of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

function autosize(el) {
  if (!el) return;
  // Growing the focused field can yank .editor-scroll back to the caret (bottom).
  // Keep the user's scroll position unless they were already pinned near the end.
  const sc = el.closest(".editor-scroll");
  let stickBottom = false;
  let top = 0;
  if (sc) {
    top = sc.scrollTop;
    stickBottom = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 48;
  }
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
  if (sc) sc.scrollTop = stickBottom ? sc.scrollHeight : top;
}

function render() {
  store.pruneView();
  const v = store.view;
  // Keep the page heading aligned with the selected notes folder.
  const brandEl = $("brand");
  if (brandEl) {
    const folderNames = [tr("tab_notes"), tr("tab_archive"), tr("tab_trash")];
    brandEl.textContent = folderNames[v.status] || folderNames[0];
  }

  document.querySelectorAll("#pane-notes .tabs .tab").forEach((t) => {
    const s = Number(t.dataset.status);
    const on = s === v.status;
    t.setAttribute("aria-selected", String(on));
    // Roving tabindex: only the active tab is in the tab order.
    t.tabIndex = on ? 0 : -1;
  });
  $("tabpanel").setAttribute("aria-label",
    [tr("tab_notes"), tr("tab_archive"), tr("tab_trash")][v.status]);
  const counts = store.counts();
  for (let i = 0; i < 3; i++) $("count-" + i).textContent = counts[i] || "";

  // Label filter, a single dropdown. Hidden in trash where labels are not the point.
  const labelsEl = $("labels");
  const labelSelect = $("label-filter");
  labelsEl.hidden = v.status === STATUS.DELETED;
  if (!labelsEl.hidden) {
    const all = [...store.labels.values()].sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || "")));
    labelSelect.replaceChildren();
    const add = (value, text) => {
      const o = document.createElement("option");
      o.value = value;
      o.textContent = text;
      labelSelect.append(o);
    };
    add("", tr("filter_all"));
    for (const l of all) add(String(l.id), l.name);
    labelSelect.value = v.label === null ? "" : String(v.label);
  }

  // Sort sheet checkmarks
  document.querySelectorAll("[data-sortfield]").forEach((b) => {
    const on = Number(b.dataset.sortfield) === v.field;
    b.style.background = on ? "var(--surface-2)" : "";
    b.style.color = on ? "var(--accent)" : "";
  });
  document.querySelectorAll("[data-sortdir]").forEach((b) => {
    const on = Number(b.dataset.sortdir) === v.dir;
    b.style.background = on ? "var(--surface-2)" : "";
    b.style.color = on ? "var(--accent)" : "";
  });

  // Surface that a filter is narrowing the list, and offer a way out.
  const filtered = v.label !== null || (typeof v.search === "string" && v.search.trim() !== "");
  $("mi-clear-filter").hidden = !filtered;
  const rt = $("mi-reminders-text");
  if (reminders.permission === "granted") rt.textContent = tr("action_reminders_enabled");
  else if (reminders.permission === "denied") rt.textContent = tr("action_reminders_blocked");
  else if (!reminders.supported) rt.textContent = tr("action_reminders_unsupported");
  else rt.textContent = tr("action_enable_reminders");

  const notes = store.visible();
  const list = $("list");
  list.replaceChildren();
  $("empty").hidden = notes.length > 0;
  $("empty-text").textContent =
    v.search ? tr("empty_no_search")
    : v.label !== null ? tr("empty_no_label")
    : v.status === STATUS.ACTIVE ? tr("empty_no_notes")
    : v.status === STATUS.ARCHIVED ? tr("empty_archive") : tr("empty_trash");

  syncSelection(notes);
  for (const note of notes) list.append(renderCard(note, v));
}

/* ------------------------------------------------------------- selection
   Tapping a card in select mode toggles it instead of opening the note. A
   selection belongs to one folder, so switching tabs clears it. */
let selectMode = false;
let selectStatus = null;
const selectedIds = new Set();

function syncSelection(notes) {
  if (selectStatus !== store.view.status) {
    selectedIds.clear();
    selectStatus = store.view.status;
  }
  const shown = new Set(notes.map((n) => n.id));
  for (const id of selectedIds) if (!shown.has(id)) selectedIds.delete(id);

  const s = store.view.status;
  const none = selectedIds.size === 0;
  $("select-bar").hidden = !selectMode;
  $("btn-select").setAttribute("aria-pressed", String(selectMode));
  $("select-count").textContent = tr("select_count").replace("{n}", String(selectedIds.size));
  $("sel-archive").hidden = s !== STATUS.ACTIVE;
  $("sel-restore").hidden = s === STATUS.ACTIVE;
  $("sel-trash").hidden = s === STATUS.DELETED;
  $("sel-forever").hidden = s !== STATUS.DELETED;
  for (const id of ["sel-archive", "sel-restore", "sel-trash", "sel-forever"]) $(id).disabled = none;
}

function setSelectMode(on) {
  selectMode = on;
  selectedIds.clear();
  render();
}

function toggleSelected(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  render();
}

function selectAllVisible() {
  const ids = store.visible().map((n) => n.id);
  const all = ids.length > 0 && ids.every((id) => selectedIds.has(id));
  selectedIds.clear();
  if (!all) ids.forEach((id) => selectedIds.add(id));
  render();
}

/* One act() call for the whole batch, so a single undo reverses it. */
async function bulkChange(status) {
  const ids = [...selectedIds].filter((id) => store.notes.has(id));
  if (!ids.length) return;
  const label = status === STATUS.ARCHIVED ? tr("action_archive")
    : status === STATUS.DELETED ? tr("action_delete") : tr("action_restore");
  const now = Date.now();
  try {
    await act(label, async () => {
      for (const id of ids) {
        const note = JSON.parse(JSON.stringify(store.notes.get(id)));
        note.status = status;
        note.modified = now;
        if (status !== STATUS.ACTIVE) note.pinned = PINNED.CANT_PIN;
        else if (note.pinned === PINNED.CANT_PIN) note.pinned = PINNED.UNPINNED;
        // Trashing drops the reminder, as changeStatus does for a single note.
        if (status === STATUS.DELETED) note.reminder = null;
        await store.put(note);
      }
    });
  } catch (e) {
    saveFailed();
    return;
  }
  reminders.reschedule();
  toast(status === STATUS.ARCHIVED ? tr("toast_archived")
    : status === STATUS.DELETED ? tr("toast_moved_to_trash") : tr("toast_unarchived"));
  setSelectMode(false);
}

async function bulkDeleteForever() {
  const ids = [...selectedIds].filter((id) => store.notes.has(id));
  if (!ids.length) return;
  const ok = await confirmDialog(tr("action_delete_forever"),
    tr("dialog_forever_body"), tr("action_delete_forever"));
  if (!ok) return;
  try {
    await act(tr("action_delete_forever"), async () => {
      for (const id of ids) await store.remove(id);
    });
  } catch (e) {
    saveFailed();
    return;
  }
  toast(tr("toast_deleted_forever"));
  setSelectMode(false);
}

function renderCard(note, v) {
  const el = document.createElement("article");
  el.className = "card";
  el.dataset.id = note.id;
  el.tabIndex = 0;
  if (note.pinned === PINNED.PINNED) el.classList.add("pinned");
  if (selectMode) {
    const picked = selectedIds.has(note.id);
    el.classList.add("selecting");
    if (picked) el.classList.add("selected");
    el.setAttribute("role", "checkbox");
    el.setAttribute("aria-checked", String(picked));
    el.append(Object.assign(document.createElement("span"), { className: "select-mark" }));
  }

  const preview = notePreview(note);
  if (note.title) {
    const t = document.createElement("div");
    t.className = "card-title";
    t.textContent = note.title;
    el.append(t);
  }
  const b = document.createElement("div");
  b.className = "card-body";
  if (preview) b.textContent = preview;
  el.append(b);

  const foot = document.createElement("div");
  foot.className = "card-foot";
  if (note.pinned === PINNED.PINNED) {
    foot.append(svgIcon("pin-ico", [
      "M12 17v5",
      "M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z",
    ]));
  }
  const when = document.createElement("span");
  when.textContent = noteStatusWord(note) + " " + showDate(
    v.field === SORT_FIELD.ADDED ? note.added : note.modified);
  foot.append(when);
  foot.append(Object.assign(document.createElement("span"), { className: "spacer" }));
  if (note.reminder && note.status !== STATUS.DELETED) {
    const r = note.reminder;
    const tag = document.createElement("span");
    tag.className = "reminder-tag" + (r.done ? " done" : isOverdue(r, Date.now()) ? " overdue" : "");
    tag.append(svgIcon("bell-ico", [
      "M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8",
      "M10.3 20a2 2 0 0 0 3.4 0",
    ]));
    tag.append(document.createTextNode(describeReminder(r)));
    tag.onclick = (e) => { e.stopPropagation(); openEditor(note.id); };
    foot.append(tag);
  }
  for (const id of (Array.isArray(note.labels) ? note.labels : []).slice(0, 4)) {
    const l = store.labels.get(id);
    if (!l) continue;
    const tag = document.createElement("span");
    tag.className = "mini-tag";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = store.labelColor(id);
    tag.append(dot, document.createTextNode(l.name));
    foot.append(tag);
  }
  el.append(foot);

  const open = () => (selectMode ? toggleSelected(note.id) : openEditor(note.id));
  el.onclick = open;
  el.onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); open(); }
  };

  if (v.field === SORT_FIELD.CUSTOM && v.status !== STATUS.DELETED && !selectMode) {
    el.style.touchAction = "pan-y";
    attachDrag(el, note);
  }
  return el;
}

function noteStatusWord(note) {
  switch (note.status) {
    case STATUS.ARCHIVED: return tr("toast_archived");
    case STATUS.DELETED: return tr("tab_trash");
    default: return note.type === TYPE.LIST ? tr("type_list") : tr("action_modified");
  }
}

/* Manual reordering. Ranks come from FractionalIndex so a move only rewrites
   the note being dragged, never its neighbours.

   Uses pointer events rather than HTML5 drag and drop, because the native
   drag API does not fire under touch. Android is the primary target. */
let currentDropTarget = null;
let currentDropAfter = false;
let dragGhost = null;

function attachDrag(el, note) {
  let hold = null;   // { id, pointerId, y0, active }

  const begin = () => {
    hold.active = true;
    const r = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.className = "card drag-ghost";
    ghost.style.width = r.width + "px";
    ghost.style.left = r.left + "px";
    ghost.style.top = r.top + "px";
    document.body.append(ghost);
    dragGhost = ghost;
    el.classList.add("dragging");
    if (navigator.vibrate) navigator.vibrate(8);
  };

  const move = (x, y) => {
    if (!dragGhost) return;
    dragGhost.style.transform = "translateY(" + (y - dragGhost.offsetHeight / 2) + "px)";
    currentDropTarget = null;
    currentDropAfter = false;
    document.querySelectorAll(".card").forEach((c) => c.classList.remove("drop-before", "drop-after"));
    // The grid has two columns on wide screens, so a card is hit by both axes.
    for (const c of document.querySelectorAll(".card:not(.dragging)")) {
      const r = c.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        currentDropTarget = c;
        currentDropAfter = y > r.top + r.height / 2;
        c.classList.add(currentDropAfter ? "drop-after" : "drop-before");
        break;
      }
    }
    // Keep dragging usable near the screen edges.
    const margin = 96;
    if (y < margin) window.scrollBy(0, -Math.ceil((margin - y) / 5));
    else if (y > window.innerHeight - margin) {
      window.scrollBy(0, Math.ceil((y - (window.innerHeight - margin)) / 5));
    }
  };

  const finish = (commit) => {
    const wasActive = hold && hold.active;
    const target = currentDropTarget;
    const after = currentDropAfter;
    hold = null;
    cleanupDrag();
    if (commit && wasActive && target && target.dataset.id !== String(note.id)) {
      reorder(note.id, Number(target.dataset.id), after);
    } else {
      render();
    }
  };

  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    hold = { id: note.id, pointerId: e.pointerId, y0: e.clientY, active: false };
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* capture is best effort */ }
    if (e.pointerType !== "touch") begin();
  });
  el.addEventListener("pointermove", (e) => {
    if (!hold || hold.pointerId !== e.pointerId) return;
    if (!hold.active) {
      // A short move is a scroll, a longer one is a drag.
      if (Math.abs(e.clientY - hold.y0) < 10) return;
      begin();
    }
    e.preventDefault();
    move(e.clientX, e.clientY);
  });
  el.addEventListener("pointerup", (e) => {
    if (hold && hold.pointerId === e.pointerId) finish(true);
  });
  el.addEventListener("pointercancel", () => { if (hold) finish(false); });
  el.addEventListener("click", (e) => {
    if (hold && hold.active) { e.stopPropagation(); e.preventDefault(); }
  }, true);
}

function cleanupDrag() {
  if (dragGhost) dragGhost.remove();
  dragGhost = null;
  currentDropTarget = null;
  currentDropAfter = false;
  document.querySelectorAll(".card").forEach((c) =>
    c.classList.remove("dragging", "drop-before", "drop-after"));
}

async function reorder(dragId, targetId, after) {
  const dragged = store.notes.get(dragId);
  if (!dragged) return;
  // Neighbours are found by rank, not by screen position: the list runs in
  // descending order by default, so "after" on screen can mean a lower rank.
  const ranked = store.visible().filter((n) => n.id !== dragged.id)
    .sort((a, b) => rankOf(a).compareTo(rankOf(b)));
  const idx = ranked.findIndex((n) => n.id === targetId);
  if (idx === -1) return;
  const descending = store.view.dir !== SORT_DIR.ASC;
  const above = after !== descending;
  // The dragged note must land strictly between two existing ranks. The
  // bounds are the target's own rank and its neighbour on the far side;
  // passing null for both would collapse to the fixed INITIAL value.
  const low = above ? rankOf(ranked[idx]) : (idx > 0 ? rankOf(ranked[idx - 1]) : null);
  const high = above ? (idx + 1 < ranked.length ? rankOf(ranked[idx + 1]) : null)
                     : rankOf(ranked[idx]);
  const rank = FractionalIndex.insert(low, high).toB64();
  try {
    await act(tr("action_reorder"), () => store.put({ ...dragged, rank }));
  } catch (e) {
    saveFailed();
  }
}

/* ----------------------------------------------------------------- editor */
let editing = null;   // working copy
let editingId = null; // null while the note is not saved yet
let editorDirty = false;

function isNoteBlank(note) {
  if (!note) return true;
  if ((note.title || "").trim() !== "") return false;
  if (note.type === TYPE.DRAW) {
    const data = note.metadata && typeof note.metadata.data === "string" ? note.metadata.data : "";
    return data === "";
  }
  if (note.type === TYPE.LIST) {
    return listItems(note).every((i) => !String(i.content || "").trim());
  }
  return String(note.content || "").trim() === "";
}

function paintEditor() {
  $("edit-title").value = editing.title;
  renderEditorBody();
  $("v-added").textContent = showDate(editing.added);
  $("v-modified").textContent = showDate(editing.modified);
  showMetaSummary();
  $("v-type").textContent = typeLabel(editing.type);
  refreshReminderRow();
  refreshLabelsRow();
  $("btn-pin").setAttribute("aria-pressed", String(editing.pinned === PINNED.PINNED));
  $("btn-pin").disabled = editing.status !== STATUS.ACTIVE;
  // The button toggles in both directions, so it is always shown.
  $("btn-archive").hidden = false;
  $("btn-convert").setAttribute("aria-label", tr("action_convert"));
  $("editor").classList.add("open");
  $("editor").setAttribute("aria-hidden", "false");
  const sc = document.querySelector("#editor .editor-scroll");
  if (sc) sc.scrollTop = 0;
  autosize($("edit-title"));
  $("edit-title").focus();
}

async function openEditor(id) {
  const note = store.notes.get(id);
  if (!note) return;
  editing = JSON.parse(JSON.stringify({
    ...note,
    labels: Array.isArray(note.labels) ? note.labels.slice() : [],
  }));
  editingId = id;
  editorDirty = false;
  paintEditor();
}

/* Opens a draft that is not written until the user types or draws something. */
function openEditorDraft() {
  const now = Date.now();
  editing = {
    type: TYPE.TEXT, title: "", content: "", metadata: blankMetadata(),
    added: now, modified: now, rank: null, status: STATUS.ACTIVE,
    pinned: PINNED.UNPINNED, labels: [], reminder: null,
  };
  editingId = null;
  editorDirty = false;
  paintEditor();
}

function typeLabel(type) {
  if (type === TYPE.LIST) return tr("type_list");
  if (type === TYPE.DRAW) return tr("type_draw");
  return tr("type_text");
}

/* The closed Details line shows the dates, so they are visible without opening it. */
function showMetaSummary() {
  $("meta-summary").textContent =
    tr("action_created") + " " + showDate(editing.added) +
    " · " + tr("action_modified") + " " + showDate(editing.modified);
}

function renderEditorBody() {
  const isList = editing.type === TYPE.LIST;
  const isDraw = editing.type === TYPE.DRAW;
  const listWrap = $("list-editor"), ta = $("edit-content"), drawWrap = $("draw-editor");
  listWrap.hidden = !isList;
  ta.hidden = isList || isDraw;
  drawWrap.hidden = !isDraw;
  $("btn-draw-pill").hidden = isDraw;
  $("editor").classList.toggle("drawing", isDraw);
  if (isList) { renderListEditor(); return; }
  if (isDraw) { renderDrawEditor(); return; }
  ta.value = editing.content; autosize(ta);
}

/* --------------------------------------------------------------- draw editor */
const DRAW_INK = "#111111";
const DRAW_PAPER = "#ffffff";
const DRAW_COLORS = [DRAW_INK, DRAW_PAPER, "#e5484d", "#46a758", "#3e63dd", "#f5d90a", "#d6409f", "#00b8d9"];
const DRAW_WIDTHS = [2, 4, 8, 14];
let drawCtx = null;
let drawActive = false;
let drawColor = DRAW_INK;
let drawWidth = DRAW_WIDTHS[1];
let drawLast = null;
let drawEraser = false;
/* Dot grid is a guide only: it is CSS behind the canvas, so it never ends up
   in the saved PNG. The choice is remembered in the database. */
let drawDots = true;
let drawBlack = false;

function imageFileName(title) {
  let name = typeof title === "string" ? title : "";
  name = name.replace(/[\u0000-\u001f\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  if (!name) name = "drawing";
  if (name.length > 60) name = name.slice(0, 60).trim();
  if (!name) name = "drawing";
  return name + ".png";
}

function applyDrawPad(canvas) {
  canvas.classList.toggle("no-dots", !drawDots);
  canvas.classList.toggle("pad-black", !!drawBlack);
}

function saveDrawingImage(canvas) {
  if (!canvas || canvas.width < 2 || canvas.height < 2 || typeof downloadBlob !== "function") {
    toast(tr("toast_save_failed"));
    return;
  }
  let blob;
  try {
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext("2d");
    ctx.fillStyle = drawBlack ? "#000000" : "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0);
    const data = out.toDataURL("image/png");
    const bin = atob(data.slice(data.indexOf(",") + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    blob = new Blob([bytes], { type: "image/png" });
  } catch (e) {
    toast(tr("toast_save_failed"));
    return;
  }
  const base = imageFileName(editing && editing.title);
  const day = typeof backupDateStamp === "function" ? backupDateStamp() : "";
  const file = day ? base.replace(/\.png$/, "-" + day + ".png") : base;
  downloadBlob(blob, file);
  toast(tr("toast_image_saved"));
}

function drawPoint(e) {
  const canvas = drawCtx && drawCtx.canvas;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
  };
}

/* Strokes autosave the same way typing does, so closing the editor without
   pressing anything extra keeps the drawing. */
function persistDrawing() {
  const canvas = drawCtx && drawCtx.canvas;
  if (!canvas) return;
  editing.metadata = { kind: "draw", data: canvas.toDataURL("image/png") };
  editorDirty = true;
  queueFlush();
}

/* The pad fills everything under the title and toolbar, so it is the size of
   the screen in both orientations. The canvas is collapsed for a moment to
   measure the room that is really left: on a phone the note column is sized by
   its content, so its own height would just echo the old canvas size. */
function drawPadBox(canvas) {
  const wrap = canvas.parentElement;
  const inner = wrap && wrap.closest(".editor-inner");
  const scroll = inner && inner.closest(".editor-scroll");
  if (!wrap || !inner || !scroll) return null;
  const width = Math.floor(wrap.clientWidth);
  if (width < 120) return null;
  const prevWidth = canvas.style.width;
  const prevHeight = canvas.style.height;
  canvas.style.width = "0px";
  canvas.style.height = "0px";
  scroll.scrollTop = 0;
  const wrapRect = wrap.getBoundingClientRect();
  const scrollRect = scroll.getBoundingClientRect();
  const cs = getComputedStyle(scroll);
  const bottom = scrollRect.top + scroll.clientHeight - (parseFloat(cs.paddingBottom) || 0);
  const height = Math.round(bottom - wrapRect.bottom);
  canvas.style.width = prevWidth;
  canvas.style.height = prevHeight;
  if (height < 120) return null;
  return { width, height };
}

/* Resizing the bitmap clears it, so the strokes are carried across. Called when
   the pad is drawn and again on rotation or a window resize. */
function fitDrawCanvas(canvas) {
  const box = drawPadBox(canvas);
  if (!box) {
    canvas.style.width = "";
    canvas.style.height = "";
    return;
  }
  /* A full-screen pad on a large display is a lot of pixels. Cap the bitmap
     rather than letting a 4K window allocate a print-sized canvas. */
  let scale = Math.min(window.devicePixelRatio || 1, 2);
  const area = box.width * box.height;
  if (area * scale * scale > 4000000) {
    scale = Math.max(1, Math.sqrt(4000000 / area));
  }
  const bitmapW = Math.round(box.width * scale);
  const bitmapH = Math.round(box.height * scale);
  if (canvas.width === bitmapW && canvas.height === bitmapH) {
    canvas.style.width = box.width + "px";
    canvas.style.height = box.height + "px";
    return;
  }
  const snapshot = document.createElement("canvas");
  snapshot.width = canvas.width;
  snapshot.height = canvas.height;
  if (canvas.width > 1 && canvas.height > 1) {
    snapshot.getContext("2d").drawImage(canvas, 0, 0);
  }
  canvas.style.width = box.width + "px";
  canvas.style.height = box.height + "px";
  canvas.width = bitmapW;
  canvas.height = bitmapH;
  const ctx = canvas.getContext("2d");
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (snapshot.width > 1 && snapshot.height > 1) {
    ctx.drawImage(snapshot, 0, 0, bitmapW, bitmapH);
  }
}

function refitDrawCanvas() {
  const canvas = document.querySelector("#draw-editor .draw-canvas");
  if (canvas) fitDrawCanvas(canvas);
}

function renderDrawEditor() {
  const wrap = $("draw-editor");
  wrap.replaceChildren();
  drawCtx = null;
  drawActive = false;
  drawLast = null;

  const canvas = document.createElement("canvas");
  canvas.className = "draw-canvas";
  applyDrawPad(canvas);
  const ctx = canvas.getContext("2d");
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  drawCtx = ctx;

  const existing = editing.metadata && typeof editing.metadata.data === "string"
    ? editing.metadata.data : "";
  if (existing.startsWith("data:")) {
    const img = new Image();
    img.onload = () => {
      if (drawCtx !== ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = existing;
  }

  const toolbar = document.createElement("div");
  toolbar.className = "draw-toolbar";
  const swatches = [];
  let eraseBtn = null;

  const selectColor = (btn, color) => {
    drawEraser = false;
    drawColor = color;
    for (const b of swatches) b.setAttribute("aria-pressed", String(b === btn));
    if (eraseBtn) eraseBtn.setAttribute("aria-pressed", "false");
  };

  for (const color of DRAW_COLORS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch";
    btn.style.background = color;
    btn.setAttribute("aria-label", color);
    btn.onclick = () => selectColor(btn, color);
    swatches.push(btn);
    toolbar.append(btn);
  }

  const widths = [];
  for (const w of DRAW_WIDTHS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "width";
    btn.textContent = String(w);
    btn.setAttribute("aria-label", w + " px");
    btn.onclick = () => {
      drawWidth = w;
      for (const b of widths) b.setAttribute("aria-pressed", String(b === btn));
    };
    widths.push(btn);
    toolbar.append(btn);
  }

  eraseBtn = document.createElement("button");
  eraseBtn.type = "button";
  eraseBtn.textContent = tr("action_erase");
  eraseBtn.onclick = () => {
    // True eraser: clear pixels instead of painting white over the dot grid.
    drawEraser = true;
    for (const b of swatches) b.setAttribute("aria-pressed", "false");
    eraseBtn.setAttribute("aria-pressed", "true");
  };
  toolbar.append(eraseBtn);

  const dotsBtn = document.createElement("button");
  dotsBtn.type = "button";
  dotsBtn.textContent = tr("action_dots");
  dotsBtn.setAttribute("aria-pressed", String(drawDots));
  dotsBtn.onclick = () => {
    drawDots = !drawDots;
    applyDrawPad(canvas);
    dotsBtn.setAttribute("aria-pressed", String(drawDots));
    db.setMetaSafe("drawDots", drawDots);
  };
  toolbar.append(dotsBtn);

  const blackBtn = document.createElement("button");
  blackBtn.type = "button";
  blackBtn.textContent = tr("action_black_pad");
  blackBtn.setAttribute("aria-label", "Black pad with white dots");
  blackBtn.setAttribute("aria-pressed", String(drawBlack));
  blackBtn.onclick = () => {
    drawBlack = !drawBlack;
    applyDrawPad(canvas);
    blackBtn.setAttribute("aria-pressed", String(drawBlack));
    db.setMetaSafe("drawBlack", drawBlack);
    if (drawBlack && drawColor === DRAW_INK) selectColor(swatches[1], DRAW_PAPER);
    else if (!drawBlack && drawColor === DRAW_PAPER) selectColor(swatches[0], DRAW_INK);
  };
  toolbar.append(blackBtn);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = tr("action_save_image");
  saveBtn.onclick = () => saveDrawingImage(canvas);
  toolbar.append(saveBtn);

  const spacer = document.createElement("span");
  spacer.className = "draw-spacer";
  toolbar.append(spacer);

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.textContent = tr("action_clear");
  clearBtn.onclick = () => {
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    persistDrawing();
  };
  toolbar.append(clearBtn);

  // Paint the initial selection onto the buttons once they exist.
  if (drawBlack) selectColor(swatches[1], DRAW_PAPER);
  else selectColor(swatches[0], DRAW_INK);
  widths[1].setAttribute("aria-pressed", "true");

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    // Synthetic pointers (and some embedded browsers) have no active pointer to
    // capture; drawing still works without it.
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    drawActive = true;
    drawLast = drawPoint(e);
    if (!drawLast) return;
    ctx.globalCompositeOperation = drawEraser ? "destination-out" : "source-over";
    // A tap leaves a dot rather than nothing.
    ctx.fillStyle = drawColor;
    ctx.beginPath();
    ctx.arc(drawLast.x, drawLast.y, drawWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drawActive || !drawLast) return;
    e.preventDefault();
    const p = drawPoint(e);
    if (!p) return;
    ctx.globalCompositeOperation = drawEraser ? "destination-out" : "source-over";
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = drawWidth;
    ctx.beginPath();
    ctx.moveTo(drawLast.x, drawLast.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    drawLast = p;
  });
  const finish = () => {
    if (!drawActive) return;
    drawActive = false;
    drawLast = null;
    persistDrawing();
  };
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);

  wrap.append(toolbar, canvas);
  // Size after the pad is in the document: before that it has no box to fill.
  fitDrawCanvas(canvas);
}

/* Rotation, a window resize, or a title that grew to another line all change
   the space the pad has. Refit rather than leaving it cut off, and keep
   whatever has been drawn. */
if (typeof window !== "undefined") {
  window.addEventListener("resize", refitDrawCanvas);
  window.addEventListener("orientationchange", refitDrawCanvas);
  const titleField = $("edit-title");
  if (titleField && typeof ResizeObserver === "function") {
    new ResizeObserver(refitDrawCanvas).observe(titleField);
  }
}

function renderListEditor() {
  const listWrap = $("list-editor");
  listWrap.replaceChildren();
  const items = listItems(editing);
  const readRows = () => {
    const rows = [...listWrap.querySelectorAll(".list-item")];
    return rows.map((row) => ({
      content: (row.querySelector("textarea")?.value || "").replace(/\n/g, " "),
      checked: !!row.querySelector('input[type="checkbox"]')?.checked,
    }));
  };
  const appendItem = (text, checked, index) => {
    const row = document.createElement("div");
    row.className = "list-item" + (checked ? " checked" : "");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = checked;
    const input = document.createElement("textarea");
    input.rows = 1;
    input.value = String(text || "").replace(/\n/g, " ");
    const sync = () => {
      row.classList.toggle("checked", cb.checked);
      applyList(readRows());
    };
    cb.onchange = sync;
    input.oninput = () => {
      // Newlines inside an item would be mistaken for new rows on the next
      // split("\n") — strip them so list rows cannot duplicate themselves.
      if (input.value.includes("\n")) input.value = input.value.replace(/\n/g, " ");
      autosize(input);
      applyList(readRows());
    };
    input.onkeydown = (e) => {
      // Adding and removing a row changes the item list, so the rows have to be
      // rebuilt. applyList only updates the model; without a re-render the new
      // item exists in the note but has no input, and a removed item keeps its
      // row on screen until something else happens to re-render.
      if (e.key === "Enter") {
        e.preventDefault();
        const cur = readRows();
        cur.splice(index + 1, 0, { content: "", checked: false });
        applyList(cur);
        renderEditorBody();
        setTimeout(() => {
          const rows = listWrap.querySelectorAll("textarea");
          if (rows[index + 1]) { rows[index + 1].focus(); }
        }, 0);
        return;
      }
      if (e.key === "Backspace" && input.value === "" && readRows().length > 1) {
        e.preventDefault();
        const cur = readRows();
        cur.splice(index, 1);
        applyList(cur);
        renderEditorBody();
        setTimeout(() => {
          const rows = listWrap.querySelectorAll("textarea");
          const target = rows[Math.max(0, index - 1)];
          if (target) { target.focus(); target.setSelectionRange(target.value.length, target.value.length); }
        }, 0);
      }
    };
    row.append(cb, input);
    listWrap.append(row);
    autosize(input);
  };
  items.forEach((it, i) => appendItem(it.content, it.checked, i));
  if (!items.length) appendItem("", false, 0);
}

function applyList(items) {
  editing.content = items.map((i) => i.content).join("\n");
  editing.metadata = listMetadata(items.map((i) => i.checked));
  editorDirty = true;
  queueFlush();
}

function collectFromInputs() {
  if (!editing) return;
  // Title is shared by every note type. List rows and drawings sync their own
  // body; skipping the whole collector for those types used to drop title edits.
  editing.title = $("edit-title").value;
  if (editing.type !== TYPE.LIST && editing.type !== TYPE.DRAW) {
    editing.content = $("edit-content").value;
  }
  editorDirty = true;
  queueFlush();
}

let flushTimer = null;
function queueFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flushEditor().catch(() => {}); }, 700);
}

/* Serialised: the 4s sweep, the debounce, visibilitychange and closeEditor can
   all fire at once, and two concurrent flushes would each capture their own
   copy of `editing` and race to write it, so the later one can lose. */
let flushInFlight = null;
/* A failed save must not be silent: the text or drawing is still on screen,
   so the user needs to know it has not reached storage. */
function saveFailed() {
  toast(tr("toast_save_failed"));
}
function flushEditor(label) {
  if (!editing || !editorDirty) return flushInFlight || Promise.resolve();
  if (flushInFlight) return flushInFlight;
  flushInFlight = doFlush(label)
    .catch(saveFailed)
    .finally(() => { flushInFlight = null; });
  return flushInFlight;
}

async function doFlush(label) {
  // Cleared up front so keystrokes during the await can set dirty again. On
  // failure it is restored below so closeEditor / the 4s sweep still retry.
  editorDirty = false;
  // Re-read the title from the field so a list/draw flush cannot keep a stale
  // value if an input event was missed.
  const titleEl = $("edit-title");
  if (titleEl) editing.title = titleEl.value;
  const t = $("v-modified");
  const prevModified = editing.modified;
  editing.modified = Date.now();
  t.textContent = showDate(editing.modified);
  showMetaSummary();
  try {
    if (editingId === null) {
      if (isNoteBlank(editing)) return;
      // The first save of a new note is what creates it, so that is the step
      // undo must reverse, not just the later edits.
      const saved = await act(tr("action_new_note_undo"),
        () => store.put(JSON.parse(JSON.stringify(editing))));
      editing = { ...saved, labels: saved.labels.slice() };
      editingId = saved.id;
      return;
    }
    const existing = store.notes.get(editingId);
    if (!existing) return;
    // The editor's own reminder is authoritative here. syncEditorReminder keeps
    // it current when the scheduler advances a series in the background, so
    // reading the stored copy instead would discard whatever the user just set.
    await act(label || tr("action_edit_note"), () =>
      store.put({ ...editing, id: editingId, added: existing.added, rank: existing.rank,
        status: editing.status, pinned: editing.pinned, reminder: editing.reminder }),
      "note:" + editingId);
  } catch (e) {
    editing.modified = prevModified;
    t.textContent = showDate(editing.modified);
    showMetaSummary();
    editorDirty = true;
    throw e;
  }
}

async function closeEditor() {
  await flushEditor();
  // An empty draft was never saved. A note that was created then emptied is
  // dropped without an undo entry — restoring a blank note is not useful.
  if (editing && isNoteBlank(editing)) {
    if (editingId !== null && store.notes.has(editingId)) {
      try { await store.remove(editingId); } catch (e) { /* leave it rather than trap the user */ }
    }
  }
  const ed = $("editor");
  ed.classList.remove("open");
  ed.setAttribute("aria-hidden", "true");
  editing = null;
  editingId = null;
  render();
}

async function togglePin() {
  if (!editing) return;
  if (editing.status !== STATUS.ACTIVE) return;
  const wasPinned = editing.pinned === PINNED.PINNED;
  editing.pinned = wasPinned ? PINNED.UNPINNED : PINNED.PINNED;
  $("btn-pin").setAttribute("aria-pressed", String(!wasPinned));
  editorDirty = true;
  await flushEditor();
}

/* Switching to a canvas would drop any typed text, so a note must be empty
   first rather than having its text silently discarded. */
function beginDrawing() {
  if (editing.content.trim() !== "") {
    toast(tr("toast_clear_before_draw"));
    return false;
  }
  editing.type = TYPE.DRAW;
  editing.content = "";
  editing.metadata = { kind: "draw", data: "" };
  return true;
}

async function enterDrawMode() {
  if (!editing || editing.type === TYPE.DRAW || !beginDrawing()) return;
  editing.modified = Date.now();
  $("v-type").textContent = typeLabel(editing.type);
  $("v-modified").textContent = showDate(editing.modified);
  renderEditorBody();
  editorDirty = true;
  await flushEditor();
}

async function convertNote() {
  if (!editing) return;
  // Cycle Text → List → Draw → Text. Switching into Draw starts a blank
  // canvas; switching back to Text clears it rather than inventing text.
  if (editing.type === TYPE.TEXT) {
    const converted = asListNote(editing);
    editing.type = converted.type;
    editing.content = converted.content;
    editing.metadata = converted.metadata;
  } else if (editing.type === TYPE.LIST) {
    if (!beginDrawing()) return;
  } else {
    editing.type = TYPE.TEXT;
    editing.content = "";
    editing.metadata = blankMetadata();
  }
  editing.modified = Date.now();
  $("v-type").textContent = typeLabel(editing.type);
  $("v-modified").textContent = showDate(editing.modified);
  renderEditorBody();
  editorDirty = true;
  await flushEditor();
}

async function changeStatus(status) {
  if (!editing) return;
  editing.status = status;
  if (status !== STATUS.ACTIVE) editing.pinned = PINNED.CANT_PIN;
  else if (editing.pinned === PINNED.CANT_PIN) editing.pinned = PINNED.UNPINNED;
  // Archiving keeps the reminder; trashing drops it, as on Android.
  if (status === STATUS.DELETED) editing.reminder = null;
  $("btn-pin").disabled = status !== STATUS.ACTIVE;
  $("row-reminder").hidden = status === STATUS.DELETED;
  editorDirty = true;
  // A queued or in-flight flush can swallow this state change: it started
  // before status changed and returns without writing the new status, leaving
  // the note stuck in its previous folder. Drain it first, then flush again.
  clearTimeout(flushTimer); flushTimer = null;
  if (flushInFlight) await flushInFlight;
  editorDirty = true;
  // Not act(): flushEditor records through act() itself, so wrapping it here
  // would push two undo entries and make one archive need two undos.
  await flushEditor(status === STATUS.DELETED ? tr("action_delete") : tr("action_archive"));
  reminders.reschedule();
}

async function deleteCurrent() {
  if (!editing) return;
  if (editingId === null && isNoteBlank(editing)) {
    editing = null; editingId = null;
    const ed = $("editor");
    ed.classList.remove("open");
    ed.setAttribute("aria-hidden", "true");
    render();
    return;
  }
  if (editing.status === STATUS.DELETED) {
    clearTimeout(flushTimer); flushTimer = null;
    if (flushInFlight) await flushInFlight;
    await act(tr("action_delete_forever"), () => store.remove(editingId));
    toast(tr("toast_deleted_forever"));
  } else {
    await changeStatus(STATUS.DELETED);
    toast(tr("toast_moved_to_trash"));
  }
  editing = null; editingId = null;
  const ed = $("editor");
  ed.classList.remove("open");
  ed.setAttribute("aria-hidden", "true");
  render();
}

/* ------------------------------------------------------------ undo / redo
   A diff stack rather than a stack of whole-database snapshots.

   The first version snapshotted every note twice per action, which made both
   time and memory grow with the size of the database: 120 entries meant 120
   full copies. Instead, before an action we keep a shallow map of object
   references, then diff it afterwards by identity. Notes are replaced rather
   than mutated in place, so a reference that changed is a note that changed,
   and only those few get cloned.

   Actions are recorded through act(), never through the restore path, so undo
   and redo cannot record themselves. */
const history = {
  past: [],
  future: [],
  LIMIT: 120,
  COALESCE_MS: 30000,
  _listeners: [],
  _suppress: false,

  onChange(fn) { this._listeners.push(fn); },
  emit() { for (const fn of this._listeners) fn(); },

  canUndo() { return this.past.length > 0; },
  canRedo() { return this.future.length > 0; },

  clear() {
    this.past.length = 0;
    this.future.length = 0;
    this.emit();
  },

  push(entry) {
    // Consecutive edits to the same note collapse into one entry, so undo
    // steps back through editing sessions rather than through keystrokes.
    const top = this.past[this.past.length - 1];
    if (top && top.subject && top.subject === entry.subject && top.label === entry.label
        && Date.now() - top.at < this.COALESCE_MS) {
      // Keep the earliest "before" and the latest "after".
      for (const [id, pair] of Object.entries(entry.notes)) {
        const held = top.notes[id];
        if (held) { held.after = pair.after; }
        else { top.notes[id] = { before: pair.before, after: pair.after }; }
      }
      for (const [id, pair] of Object.entries(entry.labels)) {
        const held = top.labels[id];
        if (held) { held.after = pair.after; }
        else { top.labels[id] = { before: pair.before, after: pair.after }; }
      }
      top.nextId = entry.nextId;
      top.at = Date.now();
    } else {
      this.past.push(entry);
      if (this.past.length > this.LIMIT) this.past.shift();
    }
    this.future.length = 0;
    this.emit();
  },

  async undo() {
    const entry = this.past.pop();
    if (!entry) return null;
    await this.apply(entry, "before");
    this.future.push(entry);
    this.emit();
    return entry.label;
  },

  async redo() {
    const entry = this.future.pop();
    if (!entry) return null;
    await this.apply(entry, "after");
    this.past.push(entry);
    this.emit();
    return entry.label;
  },

  /* Writes only the ids the diff touches, instead of rebuilding the database. */
  async apply(entry, side) {
    this._suppress = true;
    try {
      const noteWrites = [];
      for (const [rawId, pair] of Object.entries(entry.notes)) {
        const id = Number(rawId);
        const value = pair[side];
        if (value === null) {
          store.notes.delete(id);
          noteWrites.push({ kind: "del", id });
        } else {
          const clone = JSON.parse(JSON.stringify(value));
          store.notes.set(id, clone);
          noteWrites.push({ kind: "put", id, value: clone });
        }
      }
      const labelWrites = [];
      for (const [rawId, pair] of Object.entries(entry.labels)) {
        const id = Number(rawId);
        const value = pair[side];
        if (value === null) {
          store.labels.delete(id);
          labelWrites.push({ kind: "del", id });
        } else {
          const clone = JSON.parse(JSON.stringify(value));
          store.labels.set(id, clone);
          labelWrites.push({ kind: "put", id, value: clone });
        }
      }
      store.nextId = entry.nextId[side];

      await db.tx(["notes", "labels", "meta"], "readwrite", (ns, ls, ms) => {
        for (const w of noteWrites) {
          if (w.kind === "del") ns.delete(w.id); else ns.put(w.value);
        }
        for (const w of labelWrites) {
          if (w.kind === "del") ls.delete(w.id); else ls.put(w.value);
        }
        ms.put(store.nextId, "nextId");
      });

      store.pruneView();
      await reminders.catchUp();
      render();
      if (editing) {
        // Keep the open editor consistent with the restored note.
        const restored = editingId === null ? null : store.notes.get(editingId);
        if (restored) await openEditor(restored.id);
        else {
          const ed = $("editor");
          ed.classList.remove("open");
          ed.setAttribute("aria-hidden", "true");
          editing = null;
          editingId = null;
        }
      }
    } finally {
      this._suppress = false;
    }
  },
};

/* Shallow capture: map of id to the exact object currently in the store. */
function captureRefs() {
  return { notes: new Map(store.notes), labels: new Map(store.labels), nextId: store.nextId };
}

const cloneForHistory = (v) => JSON.parse(JSON.stringify(v));

/* Diffs the live store against a reference capture. Only notes whose object
   identity changed, appeared, or disappeared are cloned and recorded. */
function diffAgainst(refs) {
  const notes = {};
  let touched = false;
  for (const [id, ref] of refs.notes) {
    const now = store.notes.get(id);
    if (now !== ref) {
      touched = true;
      notes[id] = { before: cloneForHistory(ref), after: now === undefined ? null : cloneForHistory(now) };
    }
  }
  for (const [id, now] of store.notes) {
    if (!refs.notes.has(id)) {
      touched = true;
      notes[id] = { before: null, after: cloneForHistory(now) };
    }
  }
  const labels = {};
  for (const [id, ref] of refs.labels) {
    const now = store.labels.get(id);
    if (now !== ref) {
      touched = true;
      labels[id] = { before: cloneForHistory(ref), after: now === undefined ? null : cloneForHistory(now) };
    }
  }
  for (const [id, now] of store.labels) {
    if (!refs.labels.has(id)) {
      touched = true;
      labels[id] = { before: null, after: cloneForHistory(now) };
    }
  }
  if (!touched && store.nextId === refs.nextId) return null;
  return { notes, labels, nextId: { before: refs.nextId, after: store.nextId } };
}

/* Runs a mutation and records the diff. `subject` groups consecutive edits to
   the same note so typing collapses into one undo step. */
function recordDiff(refs, label, subject) {
  if (history._suppress) return;
  const diff = diffAgainst(refs);
  if (!diff) return;
  history.push({ label, subject: subject || null, ...diff, at: Date.now() });
}

async function act(label, fn, subject) {
  const refs = captureRefs();
  let result;
  try {
    result = await fn();
  } catch (e) {
    recordDiff(refs, label, subject);
    throw e;
  }
  recordDiff(refs, label, subject);
  return result;
}

/* --------------------------------------------------------- reminder editing */
let remDraft = null;   // working copy of the Reminder while the sheet is open
let remWeekdays = [];

function localDateInput(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
function localTimeInput(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getHours()) + ":" + p(d.getMinutes());
}

function openReminderSheet() {
  if (!editing) return;
  if (!reminders.supported) {
    toast(tr("action_reminders_unsupported"));
    return;
  }
  const existing = editing.reminder;
  // Default to the next whole hour today, or tomorrow if that has passed.
  const seed = existing ? existing.next : (() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d.getTime();
  })();
  remDraft = existing
    ? { ...existing, recurrence: existing.recurrence ? { ...existing.recurrence } : null }
    : createReminder(seed, null);
  remDraft.start = existing ? existing.start : seed;

  remTouched = false;
  renderReminderSheet();
  previewReminderDraft();
  showSheet("sheet-reminder");
}

function renderReminderSheet() {
  const r = remDraft;
  $("rem-date").value = localDateInput(r.next);
  $("rem-time").value = localTimeInput(r.next);

  const rec = r.recurrence;
  let mode = "";
  if (rec) {
    if (rec.freq === "DAILY") mode = "DAILY";
    else if (rec.freq === "WEEKLY") mode = "WEEKLY";
    else if (rec.freq === "MONTHLY" && rec.byday !== undefined && rec.byday !== null) mode = "MONTHLY_WEEKDAY";
    else if (rec.freq === "MONTHLY") mode = "MONTHLY_DATE";
    else if (rec.freq === "YEARLY") mode = "YEARLY";
  }
  $("rem-repeat").value = mode;

  remWeekdays = (rec && rec.freq === "WEEKLY" && rec.byday) ? rec.byday.slice() : [];
  renderWeekdayChips();
  syncWeekdayVisibility();

  const has = !!editing.reminder;
  $("rem-remove").style.display = has ? "" : "none";
  const canPostpone = has && !editing.reminder.recurrence && !editing.reminder.done;
  $("rem-postpone").style.display = canPostpone ? "" : "none";
  $("rem-done").style.display = has && !editing.reminder.done ? "" : "none";
}

/* The weekday chips only exist for a weekly rule, and the repeat selector can
   change without re-rendering the whole sheet. */
function touchReminderDraft() {
  remTouched = true;
  previewReminderDraft();
}

function syncWeekdayVisibility() {
  $("rem-weekdays-wrap").hidden = $("rem-repeat").value !== "WEEKLY";
}

function renderWeekdayChips() {
  const wrap = $("rem-weekdays");
  wrap.replaceChildren();
  for (let d = 0; d < 7; d++) {
    const b = document.createElement("button");
    b.className = "day-chip";
    b.textContent = DAY_SHORT[d].slice(0, 2);
    b.setAttribute("aria-label", DAY_NAMES[d]);
    b.setAttribute("aria-pressed", String(remWeekdays.includes(d)));
    b.onclick = () => {
      const i = remWeekdays.indexOf(d);
      if (i === -1) remWeekdays.push(d);
      else remWeekdays.splice(i, 1);
      renderWeekdayChips();
      touchReminderDraft();
    };
    wrap.append(b);
  }
}

/* Turns the sheet's inputs into a Reminder. Throws BadReminder when the
   combination cannot produce an occurrence. */
function collectReminder() {
  const dateVal = $("rem-date").value;
  const timeVal = $("rem-time").value || "09:00";
  if (!dateVal) throw new BadReminder("Pick a date.");
  // Built from local parts, because the inputs are local wall-clock values.
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateVal);
  const tm = /^(\d{1,2}):(\d{2})$/.exec(timeVal);
  if (!dm || !tm) throw new BadReminder("That date and time are not valid.");
  const y = Number(dm[1]), mo = Number(dm[2]), da = Number(dm[3]);
  const h = Number(tm[1]), mi = Number(tm[2]);
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) {
    throw new BadReminder("That date and time are not valid.");
  }
  const when = new Date(y, mo - 1, da, h, mi, 0, 0).getTime();
  // Guards a DST spring-forward gap, where the chosen wall-clock time does
  // not exist and the Date constructor silently shifts the result.
  const check = new Date(when);
  if (Number.isNaN(when) || check.getFullYear() !== y || check.getMonth() !== mo - 1
      || check.getDate() !== da) {
    throw new BadReminder("That time does not exist on that date.");
  }

  const mode = $("rem-repeat").value;
  const base = new Date(when);
  let recurrence = null;
  if (mode === "DAILY") recurrence = REC.daily(1);
  else if (mode === "WEEKLY") {
    // No days picked means "the same weekday as the date", which is what a
    // single-day weekly rule means.
    recurrence = REC.weekly(remWeekdays.length ? remWeekdays : [base.getDay()], 1);
  } else if (mode === "MONTHLY_DATE") recurrence = REC.monthlyDate(base.getDate(), 1);
  else if (mode === "MONTHLY_WEEKDAY") {
    // Which occurrence of that weekday in the month is this date?
    const nth = Math.floor((base.getDate() - 1) / 7) + 1;
    recurrence = REC.monthlyWeekday(nth, base.getDay(), 1);
  } else if (mode === "YEARLY") recurrence = REC.yearly(base.getMonth() + 1, base.getDate(), 1);

  // Anchor the series on the date in the form, not on the original start:
  // rebuilding from a start that is weeks in the past would land the next
  // occurrence in the past too. The original start is kept for continuity.
  const built = createReminder(when, recurrence);
  if (recurrence && editing.reminder && editing.reminder.start < built.start) {
    built.start = editing.reminder.start;
  }
  // A newly chosen rule must not resolve to an occurrence already past.
  let guard = 0;
  while (built.next <= Date.now() && guard++ < 500) {
    const step = findNextReminder(built);
    if (step === built) break;
    Object.assign(built, step);
  }
  return built;
}

/* Keeps an open editor in step with reminder changes made elsewhere, so a
   background advance to the next occurrence is not overwritten on flush. */
function syncEditorReminder(noteId, reminder) {
  if (!editing || editingId !== noteId) return;
  editing.reminder = reminder ? { ...reminder } : null;
  refreshReminderRow();
}

/* Recomputes the draft from the inputs and previews the result without
   writing anything. Shows the reason if the combination is impossible. */
/* True once any input in the sheet is touched. While untouched the existing
   reminder is kept verbatim: rebuilding it from its start would resurrect an
   occurrence that has already passed and roll the series backwards. */
let remTouched = false;

function currentReminderDraft() {
  if (!remTouched && editing.reminder) {
    return { ...editing.reminder, recurrence: editing.reminder.recurrence
      ? { ...editing.reminder.recurrence } : null };
  }
  return collectReminder();
}

function previewReminderDraft() {
  try {
    remDraft = currentReminderDraft();
    $("rem-preview").textContent = describeReminder(remDraft);
  } catch (e) {
    $("rem-preview").textContent = e.message || "That combination has no valid date.";
  }
}

async function saveReminderDraft() {
  try {
    const r = currentReminderDraft();
    editing.reminder = r;
    editorDirty = true;
    await flushEditor(tr("action_set_reminder"));
    closeSheet();
    $("v-reminder").textContent = describeReminder(r);
    reminders.reschedule();
    toast(r.recurrence
      ? tr("toast_reminder_set_recurring", { when: describeRecurrence(r.recurrence).toLowerCase() })
      : tr("toast_reminder_set", { when: showDate(r.next) }));
  } catch (e) {
    toast(e.message || tr("toast_reminder_failed"));
  }
}

async function reminderDone() {
  closeSheet();
  if (!editing || !editing.reminder) return;
  editing.reminder = markReminderDone(editing.reminder);
  $("v-reminder").textContent = describeReminder(editing.reminder);
  editorDirty = true;
  await flushEditor(tr("action_set_reminder"));
  reminders.reschedule();
  toast(tr("reminder_mark_done"));
}

async function reminderPostpone() {
  closeSheet();
  if (!editing || !editing.reminder) return;
  try {
    editing.reminder = postponeReminder(editing.reminder, Date.now() + 86400000);
    $("v-reminder").textContent = describeReminder(editing.reminder);
    editorDirty = true;
    await flushEditor(tr("action_set_reminder"));
    reminders.reschedule();
    toast(tr("reminder_postpone"));
  } catch (e) {
    toast(e.message || tr("reminder_postpone"));
  }
}

async function reminderRemove() {
  closeSheet();
  if (!editing) return;
  editing.reminder = null;
  $("v-reminder").textContent = tr("reminder_none");
  editorDirty = true;
  await flushEditor(tr("action_set_reminder"));
  reminders.reschedule();
  toast(tr("reminder_remove"));
}

/* Label names on the editor metadata grid. Shared by openEditor and
   saveLabels so the two cannot drift apart. */
function refreshLabelsRow() {
  $("v-labels").textContent = editing.labels.length
    ? editing.labels.map((l) => (store.labels.get(l) || {}).name).filter(Boolean).join(", ")
    : tr("reminder_none");
}

/* Reminder fields on the editor metadata grid. */
function refreshReminderRow() {
  const el = $("v-reminder");
  if (!editing) {
    el.textContent = tr("reminder_none");
    $("row-reminder").hidden = false;
    return;
  }
  el.textContent = editing.reminder ? describeReminder(editing.reminder) : tr("reminder_none");
  $("row-reminder").hidden = editing.status === STATUS.DELETED;
}

/* --------------------------------------------------------- label editing */
function renderLabelPicker() {
  const wrap = $("label-list");
  wrap.replaceChildren();
  for (const l of [...store.labels.values()].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || "")))) {
    const line = document.createElement("div");
    line.className = "label-pick-row";

    const row = document.createElement("button");
    row.type = "button";
    row.className = "row";
    const dot = document.createElement("span");
    dot.style.width = "11px";
    dot.style.height = "11px";
    dot.style.borderRadius = "50%";
    dot.style.flex = "none";
    dot.style.background = store.labelColor(l.id);
    row.append(dot, document.createTextNode(l.name));
    const on = editing.labels.includes(l.id);
    const mark = document.createElement("span");
    mark.style.marginLeft = "auto";
    mark.style.fontWeight = "600";
    mark.style.color = on ? "var(--accent)" : "transparent";
    mark.textContent = "✓";
    row.append(mark);
    row.onclick = async () => {
      const i = editing.labels.indexOf(l.id);
      if (i === -1) editing.labels.push(l.id);
      else editing.labels.splice(i, 1);
      await saveLabels();
    };

    const del = document.createElement("button");
    del.type = "button";
    del.className = "iconbtn";
    del.setAttribute("aria-label", tr("action_remove_label") + ": " + l.name);
    del.append(svgIcon(null, ["M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"]));
    del.onclick = async (e) => {
      e.stopPropagation();
      const ok = await confirmDialog(tr("dialog_delete_label_title"),
        tr("dialog_delete_label_body"), tr("action_remove_label"));
      if (!ok) return;
      try {
        await act(tr("action_remove_label"), () => store.removeLabel(l.id));
      } catch (err) {
        saveFailed();
        return;
      }
      editing.labels = editing.labels.filter((id) => id !== l.id);
      refreshLabelsRow();
      renderLabelPicker();
    };

    line.append(row, del);
    wrap.append(line);
  }
}

async function saveLabels() {
  editorDirty = true;
  await flushEditor(tr("action_edit_note"));
  refreshLabelsRow();
  renderLabelPicker();
}

async function addLabel() {
  const input = $("new-label");
  const name = input.value.trim().replace(/\s+/g, " ").slice(0, IMPORT_MAX_LABEL_NAME);
  // The label sheet can only be reached from an open note, but a stray
  // keystroke after the editor closes would otherwise throw on null.
  if (!name || !editing) return;
  let label = [...store.labels.values()].find((l) => l.name.toLowerCase() === name.toLowerCase());
  if (!label) {
    try {
      label = await act(tr("action_add_label"), () =>
        store.putLabel({ id: 0, name, hidden: false }));
    } catch (e) {
      saveFailed();
      return;
    }
  }
  if (!editing.labels.includes(label.id)) editing.labels.push(label.id);
  input.value = "";
  await saveLabels();
}

async function eraseAll() {
  const ok = await confirmDialog(tr("dialog_erase_title"),
    store.notes.size + " notes and " + store.labels.size +
    " labels will be deleted from this browser and cannot be recovered.",
    tr("dialog_erase_ok"));
  if (!ok) return;
  await db.clearAll();
  store.notes.clear();
  store.labels.clear();
  store.nextId = 1;
  // The undo stack is a full copy of every note. Leaving it behind would let
  // "Erase all notes" be undone straight after the fact.
  history.clear();
  reminders.reschedule();
  store.view.status = STATUS.ACTIVE;
  store.view.search = "";
  store.view.label = null;
  store.persistView();
  const search = $("search-input");
  if (search) search.value = "";
  const bar = $("searchbar");
  if (bar) bar.classList.remove("open");
  const searchBtn = $("btn-search");
  if (searchBtn) searchBtn.setAttribute("aria-pressed", "false");
  i18n.setLocale("en");
  render();
  toast(tr("toast_erased"));
}

/* ------------------------------------------------- password prompt + export */
function promptPassword(titleKey, bodyKey, okKey) {
  return new Promise((resolve) => {
    $("pw-title").textContent = tr(titleKey);
    $("pw-text").textContent = tr(bodyKey);
    $("pw-input").value = "";
    $("pw-ok").textContent = tr(okKey);
    const dlg = $("dlg-password");
    let settled = false;
    const cleanup = () => {
      dlg.removeEventListener("cancel", onCancel);
      dlg.removeEventListener("close", onClose);
      $("pw-ok").onclick = null;
      $("pw-cancel").onclick = null;
      $("pw-input").onkeydown = null;
    };
    const done = (v) => {
      if (settled) return;
      settled = true;
      cleanup();
      $("pw-input").value = "";
      if (dlg.open) dlg.close();
      resolve(v);
    };
    // Escape fires cancel and releases the promise. A close event is only a
    // dismissal if the dialog really is closed: close events are queued, so one
    // from the previous prompt can arrive after this prompt has already opened
    // and must not resolve it.
    const onCancel = () => done(null);
    const onClose = () => { if (!dlg.open) done(null); };
    dlg.addEventListener("cancel", onCancel);
    dlg.addEventListener("close", onClose);
    $("pw-ok").onclick = () => done($("pw-input").value);
    $("pw-cancel").onclick = () => done(null);
    $("pw-input").onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        done($("pw-input").value);
      }
    };
    if (dlg.open) dlg.close();
    dlg.showModal();
    setTimeout(() => $("pw-input").focus(), 50);
  });
}

/* Asks twice, because a lost password means losing the notes outright. */
async function promptNewPassword() {
  const first = await promptPassword("dialog_password_title", "dialog_password_body", "dialog_password_ok");
  if (!first) return null;
  const second = await promptPassword("dialog_password_confirm_title", "dialog_password_body", "dialog_password_ok");
  if (second === null) return null;
  if (first !== second) { toast(tr("dialog_password_mismatch")); return null; }
  // A single character passes PBKDF2 happily and is trivially brute-forced,
  // so it is refused here rather than producing a file that looks protected.
  if (first.length < MIN_PASSWORD_LENGTH) { toast(tr("dialog_password_too_short")); return null; }
  return first;
}

/* Import accepts a plain notes export or an encrypted container. */
async function importText(text) {
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
  if (isEncryptedContainer(parsed)) {
    const password = await promptPassword("dialog_decrypt_title", "dialog_decrypt_body", "dialog_decrypt_ok");
    if (password === null) return;
    let plain;
    try {
      plain = await cryptoBox.decrypt(parsed, password);
    } catch (err) {
      toast(err instanceof BadData ? err.message : tr("dialog_wrong_password"));
      return;
    }
    text = plain;
  }
  let result;
  try {
    result = await act(tr("action_import"), () => importData(text));
  } catch (err) {
    toast(err instanceof BadData ? err.message : tr("toast_export_failed"));
    return;
  }
  render();
  const bits = [];
  if (result.inserted) bits.push(result.inserted + " added");
  if (result.merged) bits.push(result.merged + " updated");
  if (result.renamed) bits.push(result.renamed + " duplicated");
  if (result.labels) bits.push(result.labels + " labels");
  if (result.skipped) bits.push(result.skipped + " skipped as invalid");
  let msg = tr("toast_imported") + ": " + (bits.join(", ") || "nothing new");
  // The file came from a newer exporter, so fields this version does not know
  // about may have been dropped. Say so rather than implying a clean import.
  if (result.futureVersion) msg += " · " + tr("toast_imported_newer");
  toast(msg);
}

/* --------------------------------------------------------------- undo / redo */
async function doUndo() {
  if (!history.canUndo()) {
    toast(tr("toast_nothing_undo"));
    return;
  }
  await flushEditor();
  const label = await history.undo();
  if (label) toast(tr("toast_undo") + ": " + label);
  render();
}

async function doRedo() {
  if (!history.canRedo()) {
    toast(tr("toast_nothing_redo"));
    return;
  }
  await flushEditor();
  const label = await history.redo();
  if (label) toast(tr("toast_redo") + ": " + label);
  render();
}

function refreshHistoryButtons() {
  $("mi-undo").disabled = !history.canUndo();
  $("mi-redo").disabled = !history.canRedo();
}
