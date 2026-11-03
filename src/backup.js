/* Seclusa Notes backup: notes in one file, optional encryption.
   Share and Save are separate actions (no silent fallback between them). */
(function () {
  const FORMAT = "seclusa-notes";
  /* Older combined notes+calendar backups used this name. They still restore
     here: the notes come back and the calendar half is ignored. */
  const LEGACY_FORMAT = "seclusa-nocal";
  const VERSION = 1;
  const LAST_KEY = "seclusa-notes-last-backup";

  function stamp() {
    return backupDateStamp();
  }

  function refreshBackupMeta() {
    const label = document.getElementById("bu-last");
    const nag = document.getElementById("bu-nag");
    if (label) label.textContent = lastBackupLabel(LAST_KEY);
    if (nag) {
      const text = lastBackupNagText(LAST_KEY);
      nag.textContent = text;
      nag.hidden = !text;
    }
  }

  function markBackupDone() {
    lastBackupMark(LAST_KEY);
    refreshBackupMeta();
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

  async function preparePayload(encrypted) {
    const payload = buildBackup();
    let text = JSON.stringify(payload, null, 1);
    let name = "seclusa-notes-" + stamp() + ".json";
    let type = "application/json";

    if (encrypted) {
      if (!cryptoBox.supported) {
        toast(tr("toast_encryption_unavailable"));
        return null;
      }
      const password = await promptNewPassword();
      if (!password) return null;
      try {
        toast(tr("toast_encrypting"));
        const box = await cryptoBox.encrypt(text, password);
        text = JSON.stringify(box, null, 1);
        name = "seclusa-notes-" + stamp() + ".enc.json";
        type = "application/octet-stream";
      } catch (e) {
        toast(e instanceof BadData ? e.message : tr("toast_backup_failed"));
        return null;
      }
    }
    return { text, name, type, encrypted: !!encrypted };
  }

  async function shareBackup(encrypted) {
    const prepared = await preparePayload(encrypted);
    if (!prepared) return;
    const file = new File([prepared.text], prepared.name, { type: prepared.type });
    const result = await shareFile(file);
    if (result === "shared") {
      markBackupDone();
      toast(prepared.encrypted ? tr("toast_backup_shared_enc") : tr("toast_backup_shared"));
      return;
    }
    if (result === "abort") return;
    toast(tr("toast_share_unavailable"));
  }

  async function exportBackup(encrypted) {
    const prepared = await preparePayload(encrypted);
    if (!prepared) return;
    // Password is asked before the save picker opens, so a cancelled prompt
    // never leaves an empty file behind.
    const blob = new Blob([prepared.text], { type: "application/json" });
    const how = await saveBlob(blob, prepared.name);
    if (how === null) return;
    markBackupDone();
    if (how === "picker") {
      toast(prepared.encrypted ? tr("toast_backup_saved_enc") : tr("toast_backup_saved"));
    } else {
      toast(prepared.encrypted ? tr("toast_backup_downloaded_enc") : tr("toast_backup_downloaded"));
    }
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
    const shareBtn = document.getElementById("bu-share");
    const exportBtn = document.getElementById("bu-export");
    const shareEncBtn = document.getElementById("bu-share-enc");
    const exportEncBtn = document.getElementById("bu-export-enc");
    const importBtn = document.getElementById("bu-import");
    const input = document.getElementById("backup-file-input");
    if (!exportBtn || !importBtn || !input) return;

    refreshBackupMeta();

    if (shareBtn) {
      shareBtn.onclick = () => {
        closeSheet();
        shareBackup(false).catch(() => toast(tr("toast_backup_failed")));
      };
    }
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

    window.refreshNotesBackupMeta = refreshBackupMeta;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireBackup);
  } else {
    wireBackup();
  }
})();
