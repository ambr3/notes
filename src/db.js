/* --------------------------------------------------------------- database */
const db = {
  _p: null,
  available: typeof indexedDB !== "undefined" && indexedDB !== null,
  open() {
    if (this._p) return this._p;
    // Private browsing modes and storage-partitioned iframes can leave
    // indexedDB present but refusing to open. Without this the reference
    // itself throws a ReferenceError before any handler can run.
    if (!this.available) return Promise.reject(new Error("IndexedDB unavailable"));
    this._p = new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB_NAME, 1); }
      catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("notes")) d.createObjectStore("notes", { keyPath: "id" });
        if (!d.objectStoreNames.contains("labels")) d.createObjectStore("labels", { keyPath: "id" });
        if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      // Another tab is holding an older version open and never closes, so the
      // upgrade cannot proceed. Without this the promise hangs and every
      // caller waiting on it stalls forever.
      req.onblocked = () => {
        reject(new Error("IndexedDB upgrade blocked"));
        // The request is still pending. If it succeeds later, close the
        // connection at once rather than leaving it open for the session.
        req.onsuccess = () => req.result.close();
      };
    });
    // A rejected promise must not stay cached as this._p, or one transient
    // failure would poison the database for the rest of the session.
    this._p.catch(() => { this._p = null; });
    return this._p;
  },
  /* fn returns either a plain value or an IDBRequest. A request resolves on
     its own success event, which can fire before the transaction commits, so
     both are awaited before the transaction result is handed back. */
  async tx(stores, mode, fn) {
    const d = await this.open();
    return new Promise((resolve, reject) => {
      let t;
      try { t = d.transaction(stores, mode); }
      catch (e) { reject(e); return; }
      let ret;
      try { ret = fn(...stores.map((s) => t.objectStore(s))); }
      catch (e) {
        // A synchronous throw from fn must abort the transaction, or it would
        // commit and the caller would hang waiting for oncomplete.
        try { t.abort(); } catch (err) { /* already aborting */ }
        reject(e);
        return;
      }
      const requested = ret && typeof ret === "object" && "onsuccess" in ret;
      let value;
      if (requested) {
        ret.onsuccess = () => { value = ret.result; };
        ret.onerror = () => reject(ret.error);
      } else {
        value = ret;
      }
      t.oncomplete = () => resolve(value);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error("transaction aborted"));
    });
  },
  getAll(store) { return this.tx([store], "readonly", (s) => s.getAll()); },
  put(store, val) { return this.tx([store], "readwrite", (s) => s.put(val)); },
  del(store, key) { return this.tx([store], "readwrite", (s) => s.delete(key)); },
  clearAll() {
    return this.tx(["notes", "labels", "meta"], "readwrite", (n, l, m) => {
      n.clear(); l.clear(); m.clear();
    });
  },
  getMeta(key) { return this.tx(["meta"], "readonly", (m) => m.get(key)); },
  setMeta(key, val) { return this.tx(["meta"], "readwrite", (m) => m.put(val, key)); },
  /* Fire-and-forget metadata writes. These are preferences, not notes: losing one
     to a blocked database or a quota error must not surface as an unhandled
     rejection or interrupt the action that triggered it. */
  setMetaSafe(key, val) { return this.setMeta(key, val).catch(() => {}); },
};
