/* ------------------------------------------------------------------ wire */
function wire() {
  document.querySelectorAll("#pane-notes .tabs .tab").forEach((t) => {
    const select = () => {
      const next = Number(t.dataset.status);
      // Trash hides the label row, so a filter set elsewhere would be invisible
      // yet still applied. Clear it whenever the row is not shown.
      if (next === STATUS.DELETED && store.view.label !== null) {
        store.view.label = null;
      }
      store.view.status = next;
      store.persistView();
      render();
    };
    t.onclick = select;
    // role="tablist" implies arrow-key navigation between tabs.
    t.onkeydown = (e) => {
      const tabs = [...document.querySelectorAll("#pane-notes .tabs .tab")];
      const i = tabs.indexOf(t);
      let next = null;
      if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
      else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === "Home") next = tabs[0];
      else if (e.key === "End") next = tabs[tabs.length - 1];
      if (!next) return;
      e.preventDefault();
      next.focus();
      next.click();
    };
  });
  $("btn-search").onclick = () => {
    const bar = $("searchbar");
    const open = bar.classList.toggle("open");
    $("btn-search").setAttribute("aria-pressed", String(open));
    if (open) $("search-input").focus();
    else { $("search-input").value = ""; store.view.search = ""; store.persistView(); render(); }
  };
  $("btn-search-close").onclick = () => $("btn-search").click();
  $("label-filter").onchange = (e) => {
    store.view.label = e.target.value === "" ? null : Number(e.target.value);
    store.persistView();
    render();
  };
  $("search-input").oninput = (e) => {
    store.view.search = e.target.value;
    store.persistView();
    render();
  };

  $("btn-menu").onclick = () => showSheet("sheet-main");
  $("scrim").onclick = closeSheet;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (openSheet) closeSheet(); }
    // Inside a text field the browser's own undo/redo is what the user means,
    // and overriding it would delete characters instead of reverting an action.
    const t = e.target;
    const typing = t && (t.tagName === "TEXTAREA"
      || (t.tagName === "INPUT" && /^(text|search|url|email|password|number)$/.test(t.type)));
    if (typing) return;
    // Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z, plus the platform redo combo.
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (openSheet) closeSheet();
      doUndo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y"
      || (e.shiftKey && e.key.toLowerCase() === "z"))) {
      e.preventDefault();
      if (openSheet) closeSheet();
      doRedo();
    }
  });

  $("mi-sort").onclick = () => showSheet("sheet-sort");
  document.querySelectorAll("[data-sortfield]").forEach((b) => {
    b.onclick = () => {
      store.view.field = Number(b.dataset.sortfield);
      store.persistView();
      closeSheet();
      render();
    };
  });
  document.querySelectorAll("[data-sortdir]").forEach((b) => {
    b.onclick = () => {
      store.view.dir = Number(b.dataset.sortdir);
      store.persistView();
      closeSheet();
      render();
    };
  });

  $("mi-undo").onclick = () => { closeSheet(); doUndo(); };
  $("mi-redo").onclick = () => { closeSheet(); doRedo(); };
  $("mi-erase").onclick = () => { closeSheet(); eraseAll(); };
  $("mi-clear-filter").onclick = () => {
    store.view.label = null;
    store.view.search = "";
    store.persistView();
    $("search-input").value = "";
    $("searchbar").classList.remove("open");
    $("btn-search").setAttribute("aria-pressed", "false");
    closeSheet();
    render();
    toast(tr("toast_filter_cleared"));
  };

  // Draft only: the note is written on the first real edit, so closing an
  // untouched New does not leave an empty card in the list.
  const newNote = () => { openEditorDraft(); };
  $("btn-new-pill").onclick = newNote;
  $("btn-close-editor").onclick = closeEditor;
  $("btn-pin").onclick = togglePin;
  $("btn-convert").onclick = convertNote;
  $("btn-draw-pill").onclick = enterDrawMode;
  $("btn-select").onclick = () => setSelectMode(!selectMode);
  $("btn-select-cancel").onclick = () => setSelectMode(false);
  $("btn-select-all").onclick = selectAllVisible;
  $("sel-archive").onclick = () => bulkChange(STATUS.ARCHIVED);
  $("sel-restore").onclick = () => bulkChange(STATUS.ACTIVE);
  $("sel-trash").onclick = () => bulkChange(STATUS.DELETED);
  $("sel-forever").onclick = bulkDeleteForever;
  $("mi-reminders").onclick = async () => {
    closeSheet();
    if (reminders.permission === "granted") {
      toast(tr("action_reminders_enabled"));
      return;
    }
    // The only call to Notification.requestPermission() in the app, reached
    // solely from this click. Nothing prompts on load or on first paint.
    const result = await reminders.requestPermission();
    if (result === "granted") {
      await reminders.catchUp();
      render();
      toast(tr("action_reminders_enabled"));
    } else if (result === "denied") {
      toast(tr("action_reminders_blocked"));
    }
  };
  $("btn-archive").onclick = async () => {
    if (!editing) return;
    await changeStatus(editing.status === STATUS.ARCHIVED ? STATUS.ACTIVE : STATUS.ARCHIVED);
    toast(editing.status === STATUS.ARCHIVED ? tr("toast_archived") : tr("toast_unarchived"));
    await closeEditor();
  };
  $("btn-delete").onclick = deleteCurrent;
  $("btn-note-menu").onclick = () => showSheet("sheet-note");

  $("ni-duplicate").onclick = async () => {
    closeSheet();
    if (!editing) return;
    await flushEditor();
    const copy = JSON.parse(JSON.stringify(editing));
    delete copy.id;
    copy.rank = null;
    copy.title = (copy.title || tr("sort_title")) + " (copy)";
    copy.added = Date.now();
    copy.modified = Date.now();
    // Through act(), so a duplicate can be undone like any other change.
    const saved = await act(tr("action_duplicate"), () => store.put(copy));
    await closeEditor();
    toast(tr("action_duplicate"));
    await openEditor(saved.id);
  };
  $("ni-share").onclick = async () => {
    closeSheet();
    if (!editing) return;
    const text = [editing.title, asTextNote(editing).content].filter(Boolean).join("\n");
    // Only ever on this explicit tap, and only to a handler the user or the OS
    // chose. navigator.share has no target: the browser decides.
    if (navigator.share) {
      try {
        await navigator.share({ title: editing.title || "Note", text });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        toast(tr("toast_copied"));
        return;
      } catch (e) { /* fall through to the failure message */ }
    }
    toast(tr("toast_share_failed"));
  };
  $("ni-delete").onclick = () => { closeSheet(); deleteCurrent(); };

  $("row-labels").onclick = () => { renderLabelPicker(); showSheet("sheet-labels"); };
  $("row-reminder").onclick = openReminderSheet;
  // Editing is a draft: the repeat selector reveals the weekday chips, so
  // committing on every change would close the sheet mid-selection.
  $("rem-date").onchange = touchReminderDraft;
  $("rem-time").onchange = touchReminderDraft;
  $("rem-repeat").onchange = () => { renderWeekdayChips(); syncWeekdayVisibility(); touchReminderDraft(); };
  $("rem-save").onclick = saveReminderDraft;
  $("rem-done").onclick = reminderDone;
  $("rem-postpone").onclick = reminderPostpone;
  $("rem-remove").onclick = reminderRemove;
  $("btn-add-label").onclick = addLabel;
  $("new-label").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); addLabel(); } };
  $("row-type").onclick = convertNote;
  $("row-save-date").onclick = async () => {
    if (!editing || editingId === null) return;
    // doFlush deliberately preserves the stored created date, so the reset has
    // to go through the store rather than only mutating the draft.
    const stamp = Date.now();
    editing.modified = stamp;
    await act(tr("action_edit_note"), () => store.put({
      ...editing, id: editingId, added: stamp, modified: stamp,
      rank: editing.rank, status: editing.status, pinned: editing.pinned,
      reminder: editing.reminder,
    }), "note:" + editingId);
    editing.added = stamp;
    $("v-added").textContent = showDate(editing.added);
    $("v-modified").textContent = showDate(editing.modified);
    toast(tr("toast_dates_reset"));
  };

  $("edit-title").oninput = () => { autosize($("edit-title")); collectFromInputs(); };
  $("edit-content").oninput = () => { autosize($("edit-content")); collectFromInputs(); };

  // Save on the lifecycle events Android actually delivers. visibilitychange
  // and pagehide cover the swipe-away case; beforeunload is unreliable on
  // mobile and is deliberately not used.
  document.addEventListener("visibilitychange", () => {
    // These are lifecycle callbacks with no caller to await them, so each one
    // carries its own catch: an unhandled rejection here would be silent.
    if (document.visibilityState === "hidden") {
      flushEditor().catch(() => {});
    }
    // Coming back to the foreground is when overdue reminders can be caught up.
    else reminders.catchUp().then(render).catch(() => {});
  });
  window.addEventListener("pagehide", () => {
    flushEditor().catch(() => {});
  });
  // Flush pending editor text every few seconds so an OS kill cannot lose it.
  setInterval(() => {
    if (editing && editorDirty) flushEditor().catch(() => {});
  }, 4000);

  history.onChange(refreshHistoryButtons);
  refreshHistoryButtons();
  store.onChange(render);
}

/* ------------------------------------------------------------------- boot */
(async function boot() {
  wire();
  // The locale has to be known before the first render so the markup is
  // translated on screen rather than flashing English first.
  const savedLocale = await db.getMeta("locale").catch(() => null);
  i18n.setLocale(savedLocale || "en");
  history.clear();
  try {
    await store.load();
  } catch (e) {
    toast(tr("toast_storage_unavailable"));
  }
  drawDots = (await db.getMeta("drawDots").catch(() => null)) !== false;
  // Reminders only fire once notifications are allowed, and anything that
  // elapsed while the app was shut is caught up here.
  reminders.permission = reminders.supported ? Notification.permission : "unsupported";
  await reminders.catchUp().catch(() => {});
  render();

  // /index.html?new=1 opens straight into a fresh note; ?note=<id> is how a
  // tapped notification lands on the right note.
  //
  // The value is only ever used as a Map key lookup against notes that already
  // exist, so a crafted ?note= cannot select, create, or render anything: a
  // non-numeric or unknown id simply falls through. The string itself is never
  // interpolated into markup or passed to a URL.
  const params = new URLSearchParams(location.search);
  if (params.get("new") === "1") $("btn-new-pill").click();
  else if (params.has("note")) {
    const wanted = Number(params.get("note"));
    if (Number.isSafeInteger(wanted) && store.notes.has(wanted)) openEditor(wanted);
  }

  // A notification tapped while the app is already open arrives as a message.
  // The id is used solely as an existing-note lookup, never rendered, so even
  // a spoofed payload can at most re-open a note the user already has.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (!e.data || e.data.type !== "open-note") return;
      const wanted = e.data.noteId;
      if (Number.isSafeInteger(wanted) && store.notes.has(wanted)) openEditor(wanted);
    });
  }

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {});
  }
})();
