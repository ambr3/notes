/* App shell for Seclusa Notes: Theme sheet, About and Backup sheets.

   Theme mode: system / light / dark under ssc.pref_key_night_mode.
   Background swatches via SeclusaThemeSheet (ssc.pref_key_bg). */
(function () {
  const THEME_KEY = "ssc.pref_key_night_mode";
  const LEGACY_KEY = "privacy_calendar_theme";
  const LIGHT = "#ffffff";
  const DARK = "#0a0a0a";

  function safeGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }
  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_) {
      /* storage full or blocked: the theme is cosmetic */
    }
  }
  function safeRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (_) { /* ignore */ }
  }

  function prefersDark() {
    try {
      return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    } catch (_) {
      return false;
    }
  }

  function readMode() {
    const v = safeGet(THEME_KEY);
    if (v === "light" || v === "dark") return v;
    if (v === "system" || v === null || v === "") {
      const legacy = safeGet(LEGACY_KEY);
      if (legacy === "light") {
        safeSet(THEME_KEY, "light");
        safeRemove(LEGACY_KEY);
        return "light";
      }
      if (legacy === "dark" || legacy === "bw") {
        safeSet(THEME_KEY, "dark");
        safeRemove(LEGACY_KEY);
        return "dark";
      }
      return "system";
    }
    return "system";
  }

  function resolve(mode) {
    if (mode === "dark") return "dark";
    if (mode === "light") return "light";
    return prefersDark() ? "dark" : "light";
  }

  function applyMode(mode) {
    const theme = resolve(mode);
    document.documentElement.setAttribute("data-theme", theme);
    const colour = theme === "dark" ? DARK : LIGHT;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      m.setAttribute("content", colour);
    });
    const label = document.getElementById("theme-toggle-label");
    if (label) label.textContent = "Theme";
    const btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.setAttribute("aria-pressed", mode === "system" ? "false" : "true");
      btn.title = "Theme settings";
    }
  }

  function setMode(mode) {
    if (mode === "system") safeRemove(THEME_KEY);
    else safeSet(THEME_KEY, mode);
    safeRemove(LEGACY_KEY);
    applyMode(mode);
  }

  if (window.matchMedia) {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readMode() === "system") applyMode("system");
    };
    if (query.addEventListener) query.addEventListener("change", onChange);
    else if (query.addListener) query.addListener(onChange);
  }

  const aboutBtn = document.getElementById("nav-about");
  const backupBtn = document.getElementById("nav-backup");
  if (aboutBtn) aboutBtn.addEventListener("click", () => showSheet("sheet-about"));
  if (backupBtn) {
    backupBtn.addEventListener("click", () => {
      if (typeof window.refreshNotesBackupMeta === "function") window.refreshNotesBackupMeta();
      showSheet("sheet-backup");
    });
  }

  const notesBtn = document.querySelector('#app-nav .app-nav-btn[data-pane="notes"]');
  const listPane = document.querySelector("#pane-notes > main");
  if (notesBtn && listPane) {
    notesBtn.addEventListener("click", () => listPane.scrollTo({ top: 0, behavior: "smooth" }));
  }

  document.title = "Seclusa Notes";
  applyMode(readMode());

  if (window.SeclusaThemeSheet) {
    window.SeclusaThemeSheet.wire({
      getMode: readMode,
      setMode: setMode,
      showSheet: typeof showSheet === "function" ? showSheet : undefined,
    });
  }
})();
