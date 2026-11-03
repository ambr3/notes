/* Seclusa backup helpers: encrypted containers, share/save/download, last-backup stamp.

   Canonical copy: shared/backup/seclusa-backup.js
   Each published app carries an identical file (offline + per-repo Pages).
   Change here first, then copy into notes, calendar, and blood-pressure.

   Encrypted container (AES-256-GCM + PBKDF2-HMAC-SHA512):
     salt        128 random bytes, base64 without padding
     key         PBKDF2-HMAC-SHA512, 210000 iterations, 256-bit
                 (the count is stored in the file, so older files still open)
     cipher      AES-256-GCM, 12-byte IV, 128-bit tag appended to ciphertext
     container   {"salt":"...","nonce":"...","ciphertext":"..."} (+ version/kdf)

   File out never keeps a folder handle between exports.
*/
"use strict";

const EXPORT_SALT_BYTES = 128;
const PBKDF2_ITERATIONS = 210000;
const PBKDF2_MAX_ITERATIONS = 600000;
const PBKDF2_HASH = "SHA-512";
const GCM_IV_BYTES = 12;
const ENCRYPTED_VERSION = 1;
const MIN_PASSWORD_LENGTH = 8;
const LAST_BACKUP_NAG_DAYS = 30;

function backupFail(message) {
  if (typeof BadData === "function") throw new BadData(message);
  const err = new Error(message);
  err.name = "SeclusaBackupError";
  throw err;
}

function toBase64(bytes) {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s).replace(/=+$/, "");
}

function fromBase64(str) {
  const s = String(str || "").trim().replace(/\s+/g, "");
  if (!s) return new Uint8Array(0);
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const cryptoBox = {
  supported: typeof crypto !== "undefined" && !!crypto.subtle,

  async deriveKey(password, salt, params) {
    let iterations = (params && params.iterations > 0) ? params.iterations : PBKDF2_ITERATIONS;
    if (iterations > PBKDF2_MAX_ITERATIONS) {
      backupFail("This file asks for too many key-derivation rounds.");
    }
    const hash = (params && typeof params.hash === "string") ? params.hash : PBKDF2_HASH;
    if (hash !== PBKDF2_HASH && hash !== "SHA-256") {
      backupFail("This file uses an unsupported key-derivation hash.");
    }
    const base = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations, hash },
      base,
      256,
    );
    return crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  },

  async encrypt(text, password) {
    if (!this.supported) backupFail("Encryption is unavailable in this browser.");
    const salt = crypto.getRandomValues(new Uint8Array(EXPORT_SALT_BYTES));
    const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
    const key = await this.deriveKey(password, salt);
    const data = new TextEncoder().encode(text);
    const sealed = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data),
    );
    return {
      version: ENCRYPTED_VERSION,
      kdf: { name: "PBKDF2", hash: PBKDF2_HASH, iterations: PBKDF2_ITERATIONS, keyBits: 256 },
      salt: toBase64(salt),
      nonce: toBase64(iv),
      ciphertext: toBase64(sealed),
    };
  },

  async decrypt(container, password) {
    if (!this.supported) backupFail("Encryption is unavailable in this browser.");
    let salt, iv, sealed;
    try {
      salt = fromBase64(container.salt);
      iv = fromBase64(container.nonce);
      sealed = fromBase64(container.ciphertext);
    } catch (e) {
      backupFail("This file is not a valid encrypted export.");
    }
    if (!salt.length || iv.length !== GCM_IV_BYTES || sealed.length <= 16) {
      backupFail("This file is missing its encryption data.");
    }
    const key = await this.deriveKey(password, salt, container.kdf);
    let plain;
    try {
      plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, sealed);
    } catch (e) {
      backupFail("Wrong password, or the file is damaged.");
    }
    return new TextDecoder().decode(plain);
  },
};

function isEncryptedContainer(data) {
  return !!data && typeof data === "object" && !Array.isArray(data)
    && typeof data.ciphertext === "string" && typeof data.salt === "string"
    && typeof data.nonce === "string" && data.notes === undefined
    && data.events === undefined && data.readings === undefined;
}

function backupDateStamp() {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function downloadBlob(blob, filename) {
  // Must be in the document: detached <a>.click() is ignored in Firefox and
  // often after an await (password dialog) in Chromium too.
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 2000);
}

/* Prefer the system save picker when available. Falls back to a download.
   Returns "picker" | "download" | null (user cancelled the picker). */
async function saveBlob(blob, filename, types) {
  if (typeof window !== "undefined" && typeof window.showSaveFilePicker === "function") {
    try {
      const fh = await window.showSaveFilePicker({
        suggestedName: filename,
        types: types || [{
          description: "Backup",
          accept: { "application/json": [".json"] },
        }],
      });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
      return "picker";
    } catch (e) {
      if (e && e.name === "AbortError") return null;
    }
  }
  downloadBlob(blob, filename);
  return "download";
}

/* OS share sheet for a File. Returns "shared" | "abort" | "unavailable". */
async function shareFile(file) {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return "unavailable";
  }
  try {
    await navigator.share({ files: [file] });
    return "shared";
  } catch (e) {
    if (e && e.name === "AbortError") return "abort";
    return "unavailable";
  }
}

function lastBackupGet(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch (e) {
    return null;
  }
}

function lastBackupMark(storageKey) {
  try {
    localStorage.setItem(storageKey, String(Date.now()));
    return true;
  } catch (e) {
    return false;
  }
}

function lastBackupAgeDays(storageKey) {
  const at = lastBackupGet(storageKey);
  if (at == null) return null;
  return Math.floor((Date.now() - at) / 86400000);
}

function lastBackupIsStale(storageKey, days) {
  const limit = typeof days === "number" ? days : LAST_BACKUP_NAG_DAYS;
  const age = lastBackupAgeDays(storageKey);
  if (age === null) return true;
  return age >= limit;
}

function lastBackupLabel(storageKey) {
  const age = lastBackupAgeDays(storageKey);
  if (age === null) return "Last backup: never";
  if (age <= 0) return "Last backup: today";
  if (age === 1) return "Last backup: yesterday";
  return "Last backup: " + age + " days ago";
}

function lastBackupNagText(storageKey, days) {
  if (!lastBackupIsStale(storageKey, days)) return "";
  const age = lastBackupAgeDays(storageKey);
  if (age === null) {
    return "No backup yet. Share or save one so you can recover if this browser’s data is cleared.";
  }
  const limit = typeof days === "number" ? days : LAST_BACKUP_NAG_DAYS;
  return "It has been " + age + " days since your last backup (reminder after " + limit + " days).";
}

const SeclusaBackup = {
  cryptoBox,
  isEncryptedContainer,
  MIN_PASSWORD_LENGTH,
  LAST_BACKUP_NAG_DAYS,
  backupDateStamp,
  downloadBlob,
  saveBlob,
  shareFile,
  lastBackupGet,
  lastBackupMark,
  lastBackupAgeDays,
  lastBackupIsStale,
  lastBackupLabel,
  lastBackupNagText,
};

/* Classic scripts: const does not land on window; BP (and others) look it up there. */
if (typeof window !== "undefined") window.SeclusaBackup = SeclusaBackup;
