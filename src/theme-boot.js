/*
 * Seclusa theme boot — mode + background (grid / solid / custom) before first paint.
 * No Day/Night (Weather-only). Canonical helper text lives here; apps copy as theme-boot.js.
 *
 * Storage:
 *   ssc.pref_key_night_mode — light | dark | absent (= system)
 *   ssc.pref_key_bg — grid | named | custom
 *   ssc.pref_key_bg_custom — #rrggbb
 */
(function () {
  var KEY_THEME = "ssc.pref_key_night_mode";
  var KEY_BG = "ssc.pref_key_bg";
  var KEY_BG_CUSTOM = "ssc.pref_key_bg_custom";
  var LEGACY_KEY = "privacy_calendar_theme";
  var BG = {
    grid: 1, blue: 1, lightblue: 1, teal: 1, green: 1, yellow: 1,
    orange: 1, red: 1, purple: 1, black: 1, white: 1, custom: 1
  };

  function readPref() {
    try {
      var v = localStorage.getItem(KEY_THEME);
      if (v === "light" || v === "dark") return v;
      var legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy === "light") return "light";
      if (legacy === "dark" || legacy === "bw") return "dark";
      return null;
    } catch (err) {
      return null;
    }
  }

  function readHex(v) {
    return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
  }

  function readBg() {
    try {
      var raw = localStorage.getItem(KEY_BG);
      return BG[raw] ? raw : null;
    } catch (err) {
      return null;
    }
  }

  function readCustom() {
    try {
      return readHex(localStorage.getItem(KEY_BG_CUSTOM));
    } catch (err) {
      return null;
    }
  }

  try {
    var html = document.documentElement;
    var saved = readPref();
    if (saved) {
      html.setAttribute("data-theme", saved);
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      html.setAttribute("data-theme", "dark");
    }

    var bg = readBg();
    var custom = readCustom();
    try { html.removeAttribute("style"); } catch (err) { /* ignore */ }
    if (custom) {
      try {
        var sheet = new CSSStyleSheet();
        sheet.insertRule("html { --bg-custom: " + custom + "; }", 0);
        document.adoptedStyleSheets = [].concat(document.adoptedStyleSheets, sheet);
      } catch (err) { /* fallback in CSS */ }
    }
    if (bg && bg !== "grid") {
      html.setAttribute("data-bg", bg);
      var tone = "light";
      if (bg === "black") {
        tone = "dark";
      } else if (bg === "custom" && custom) {
        var n = parseInt(custom.slice(1), 16);
        var r = ((n >> 16) & 255) / 255;
        var g = ((n >> 8) & 255) / 255;
        var b = (n & 255) / 255;
        var luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        tone = luma < 0.18 ? "dark" : "light";
      }
      html.setAttribute("data-bg-tone", tone);
    } else {
      html.removeAttribute("data-bg");
      html.removeAttribute("data-bg-tone");
    }
  } catch (err) {
    /* Storage blocked, or no matchMedia. The light default in the markup stands. */
  }
})();
