/* Seclusa Notes backup: notes in one file, optional encryption. */
(function () {
  const FORMAT = "seclusa-notes";
  /* Older combined notes+calendar backups used this name. They still restore
     here: the notes come back and the calendar half is ignored. */
  const LEGACY_FORMAT = "seclusa-nocal";
  const VERSION = 1;

  function stamp() {
    const d = new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  /* Wrapper the importer recognises. `notes` holds the Another-notes-app
     schema document from serialize() so Android exports and plain schema
     files still import through the fallback path below. */
  function buildBackup() {
    return {
      format: FORMAT,
      version: VERSION,
      notes: JSON.parse(serialize()),
    };
  }

  /* Share or download a file the user picks. The app never keeps a folder
     handle — the choice happens once per export. */
  async function shareBackup(encrypted) {
    const payload = buildBackup();
    let text = JSON.stringify(payload, null, 1);
    let name = "seclusa-notes-" + stamp() + ".json";
    let type = "application/json";

    if (encrypted) {
      if (!cryptoBox.supported) {
        toast(tr("toast_encryption_unavailable"));
        return;
      }
      const password = await promptNewPassword();
      if (!password) return;
      try {
        toast(tr("toast_encrypting"));
        const box = await cryptoBox.encrypt(text, password);
        text = JSON.stringify(box, null, 1);
        name = "seclusa-notes-" + stamp() + ".enc.json";
        type = "application/octet-stream";
      } catch (e) {
        toast(e instanceof BadData ? e.message : tr("toast_backup_failed"));
        return;
      }
    }

    const file = new File([text], name, { type });
    if (typeof navigator.share === "function") {
      try {
        // No target named: the browser decides, the same way the note share
        // already works (see main.js ni-share). Share only the file: some
        // implementations reject mixed payloads.
        await navigator.share({ files: [file] });
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
        // Anything else falls through to the download, which always works.
      }
    }

    const how = await saveBlob(new Blob([text], { type }), name);
    if (how === null) return;
    toast(encrypted ? tr("toast_backup_downloaded_enc") : tr("toast_backup_downloaded"));
  }

  async function exportBackup(encrypted) {
    const payload = buildBackup();
    let text = JSON.stringify(payload, null, 1);
    let name = "seclusa-notes-" + stamp() + ".json";
    // The password is asked for before the save picker opens, so a cancelled
    // prompt never leaves an empty file behind. saveBlob falls back to a
    // download if the browser refuses the picker without a user gesture.
    if (encrypted) {
      if (!cryptoBox.supported) {
        toast(tr("toast_encryption_unavailable"));
        return;
      }
      const password = await promptNewPassword();
      if (!password) return;
      try {
        toast(tr("toast_encrypting"));
        const box = await cryptoBox.encrypt(text, password);
        text = JSON.stringify(box, null, 1);
        name = "seclusa-notes-" + stamp() + ".enc.json";
      } catch (e) {
        toast(e instanceof BadData ? e.message : tr("toast_backup_failed"));
        return;
      }
    }
    const blob = new Blob([text], { type: "application/json" });
    const how = await saveBlob(blob, name);
    if (how === null) return;
    toast(encrypted ? tr("toast_backup_saved_enc") : tr("toast_backup_saved"));
  }

  async function importBackupText(text) {
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      throw new BadData("File is not valid JSON.");
    }

    if (isEncryptedContainer(parsed)) {
      const password = await promptPassword(
        "dialog_decrypt_title",
        "dialog_decrypt_body",
        "dialog_decrypt_ok",
      );
      if (password === null) return;
      try {
        parsed = JSON.parse(await cryptoBox.decrypt(parsed, password));
      } catch (err) {
        toast(err instanceof BadData ? err.message : tr("dialog_wrong_password"));
        return;
      }
    }

    if (parsed && (parsed.format === FORMAT || parsed.format === LEGACY_FORMAT)) {
      const legacy = parsed.format === LEGACY_FORMAT;
      if (!parsed.notes || typeof parsed.notes !== "object") {
        throw new BadData("This backup has no notes in it.");
      }
      const result = await act("Restore notes", () =>
        importData(JSON.stringify(parsed.notes)),
      );
      const bits = [];
      if (result.inserted) bits.push(result.inserted + " notes added");
      if (result.merged) bits.push(result.merged + " notes updated");
      if (result.labels) bits.push(result.labels + " labels");
      if (result.skipped) bits.push(result.skipped + " skipped as invalid");
      if (typeof render === "function") render();
      toast(
        "Restored: " + (bits.join(", ") || "nothing new") +
        (legacy ? " (calendar part ignored — this app is notes only)" : ""),
      );
      return;
    }

    // Plain Another-notes-app schema ({ version, notes, labels }) or an older
    // export that omitted the seclusa-notes wrapper.
    if (parsed && parsed.notes !== undefined) {
      await importText(JSON.stringify(parsed));
      return;
    }

    throw new BadData("File is not a Seclusa Notes backup.");
  }

  function wireBackup() {
    const exportBtn = document.getElementById("bu-export");
    const exportEncBtn = document.getElementById("bu-export-enc");
    const shareEncBtn = document.getElementById("bu-share-enc");
    const importBtn = document.getElementById("bu-import");
    const input = document.getElementById("backup-file-input");
    if (!exportBtn || !importBtn || !input) return;

    exportBtn.onclick = () => {
      closeSheet();
      exportBackup(false).catch(() => toast(tr("toast_backup_failed")));
    };
    if (exportEncBtn) {
      exportEncBtn.hidden = !cryptoBox.supported;
      exportEncBtn.onclick = () => {
        closeSheet();
        exportBackup(true).catch(() => toast(tr("toast_backup_failed")));
      };
    }
    if (shareEncBtn) {
      // navigator.share with files is not universal; fall back to the download
      // path when it is missing, but do not hide the button merely because
      // canShare is unavailable or disagrees about an empty dummy file.
      shareEncBtn.hidden = !cryptoBox.supported;
      shareEncBtn.onclick = () => {
        closeSheet();
        shareBackup(true).catch(() => toast(tr("toast_backup_failed")));
      };
    }
    importBtn.onclick = () => {
      closeSheet();
      input.click();
    };
    input.onchange = async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      if (file.size > IMPORT_MAX_FILE_BYTES) {
        toast(tr("toast_too_large"));
        return;
      }
      try {
        await importBackupText(await file.text());
      } catch (err) {
        toast(err instanceof BadData ? err.message : tr("toast_import_failed"));
      }
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireBackup);
  } else {
    wireBackup();
  }
})();
