/* Encrypted backup container (AES-256-GCM + PBKDF2-HMAC-SHA512).

     salt        128 random bytes, base64 without padding
     key         PBKDF2-HMAC-SHA512, 210000 iterations, 256-bit
                 (the count is stored in the file, so older files still open)
     cipher      AES-256-GCM, 12-byte IV, 128-bit tag appended to ciphertext
     container   {"salt": "...", "nonce": "...", "ciphertext": "..."}
*/
const EXPORT_SALT_BYTES = 128;
const PBKDF2_ITERATIONS = 210000;
const PBKDF2_MAX_ITERATIONS = 600000;
const PBKDF2_HASH = "SHA-512";
const GCM_IV_BYTES = 12;
const ENCRYPTED_VERSION = 1;
const MIN_PASSWORD_LENGTH = 8;

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
      throw new BadData("This file asks for too many key-derivation rounds.");
    }
    const hash = (params && typeof params.hash === "string") ? params.hash : PBKDF2_HASH;
    if (hash !== PBKDF2_HASH && hash !== "SHA-256") {
      throw new BadData("This file uses an unsupported key-derivation hash.");
    }
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations, hash }, base, 256);
    return crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  },

  async encrypt(text, password) {
    if (!this.supported) throw new BadData("Encryption is unavailable in this browser.");
    const salt = crypto.getRandomValues(new Uint8Array(EXPORT_SALT_BYTES));
    const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
    const key = await this.deriveKey(password, salt);
    const data = new TextEncoder().encode(text);
    const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data));
    return {
      version: ENCRYPTED_VERSION,
      kdf: { name: "PBKDF2", hash: PBKDF2_HASH, iterations: PBKDF2_ITERATIONS, keyBits: 256 },
      salt: toBase64(salt), nonce: toBase64(iv), ciphertext: toBase64(sealed),
    };
  },

  async decrypt(container, password) {
    if (!this.supported) throw new BadData("Encryption is unavailable in this browser.");
    let salt, iv, sealed;
    try {
      salt = fromBase64(container.salt);
      iv = fromBase64(container.nonce);
      sealed = fromBase64(container.ciphertext);
    } catch (e) {
      throw new BadData("This file is not a valid encrypted export.");
    }
    if (!salt.length || iv.length !== GCM_IV_BYTES || sealed.length <= 16) {
      throw new BadData("This file is missing its encryption data.");
    }
    const key = await this.deriveKey(password, salt, container.kdf);
    let plain;
    try {
      plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, sealed);
    } catch (e) {
      throw new BadData("Wrong password, or the file is damaged.");
    }
    return new TextDecoder().decode(plain);
  },
};

function isEncryptedContainer(data) {
  return !!data && typeof data === "object" && !Array.isArray(data)
    && typeof data.ciphertext === "string" && typeof data.salt === "string"
    && typeof data.nonce === "string" && data.notes === undefined;
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

/* Prefer the system save picker when available — still works after async
   password prompts, and the user can share the file anywhere they trust. */
async function saveBlob(blob, filename) {
  if (typeof window.showSaveFilePicker === "function") {
    try {
      const fh = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
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
