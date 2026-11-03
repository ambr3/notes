/* Seclusa Theme sheet — Mode (system/light/dark) + Background swatches.
   No Day/Night (Weather-only). Canonical: shared/theme/theme-sheet.js
   Copy into notes/src, calendar/src, blood-pressure/static/js. */
(function (global) {
  "use strict";

  var KEY_BG = "ssc.pref_key_bg";
  var KEY_BG_CUSTOM = "ssc.pref_key_bg_custom";
  var BG_OK = {
    grid: 1, blue: 1, lightblue: 1, teal: 1, green: 1, yellow: 1,
    orange: 1, red: 1, purple: 1, black: 1, white: 1, custom: 1
  };
  var DEFAULT_CUSTOM = "#5faff0";

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }

  function readHex(v) {
    return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
  }

  function readBg() {
    var raw = safeGet(KEY_BG);
    return BG_OK[raw] ? raw : "grid";
  }

  function readCustom() {
    return readHex(safeGet(KEY_BG_CUSTOM)) || DEFAULT_CUSTOM;
  }

  function luma(hex) {
    var n = parseInt(hex.slice(1), 16);
    var r = ((n >> 16) & 255) / 255;
    var g = ((n >> 8) & 255) / 255;
    var b = (n & 255) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function toneFor(bg, customHex) {
    if (bg === "grid") return null;
    if (bg === "black") return "dark";
    if (bg === "custom") return luma(customHex || DEFAULT_CUSTOM) < 0.18 ? "dark" : "light";
    return "light";
  }

  var customSheet = null;

  function setCustomVar(hex) {
    var colour = readHex(hex) || DEFAULT_CUSTOM;
    try {
      if (customSheet && document.adoptedStyleSheets) {
        var next = [];
        var sheets = document.adoptedStyleSheets;
        for (var i = 0; i < sheets.length; i++) {
          if (sheets[i] !== customSheet) next.push(sheets[i]);
        }
        document.adoptedStyleSheets = next;
      }
      customSheet = new CSSStyleSheet();
      customSheet.insertRule("html { --bg-custom: " + colour + "; }", 0);
      document.adoptedStyleSheets = [].concat(document.adoptedStyleSheets || [], customSheet);
    } catch (e) {
      try { document.documentElement.style.setProperty("--bg-custom", colour); } catch (err) { /* ignore */ }
    }
  }

  function applyBackground(bg, customHex) {
    var value = BG_OK[bg] ? bg : "grid";
    var colour = readHex(customHex) || readCustom();
    var html = document.documentElement;
    if (value === "grid") {
      html.removeAttribute("data-bg");
      html.removeAttribute("data-bg-tone");
    } else {
      html.setAttribute("data-bg", value);
      var tone = toneFor(value, colour);
      if (tone) html.setAttribute("data-bg-tone", tone);
      else html.removeAttribute("data-bg-tone");
    }
    if (value === "custom") setCustomVar(colour);
    return { bg: value, custom: colour };
  }

  function setBackground(bg, customHex) {
    var value = BG_OK[bg] ? bg : "grid";
    if (value === "grid") safeSet(KEY_BG, "grid");
    else safeSet(KEY_BG, value);
    if (customHex && readHex(customHex)) safeSet(KEY_BG_CUSTOM, readHex(customHex));
    return applyBackground(value, customHex || readCustom());
  }

  function syncSheetUi(getMode) {
    var mode = typeof getMode === "function" ? getMode() : "system";
    document.querySelectorAll("[data-theme-opt]").forEach(function (btn) {
      var opt = btn.getAttribute("data-theme-opt");
      var on = opt === mode;
      btn.setAttribute("aria-checked", on ? "true" : "false");
      btn.classList.toggle("active", on);
    });
    var bg = readBg();
    document.querySelectorAll("[data-bg-opt]").forEach(function (btn) {
      var opt = btn.getAttribute("data-bg-opt");
      var on = opt === bg;
      btn.setAttribute("aria-checked", on ? "true" : "false");
      btn.classList.toggle("active", on);
    });
    var picker = document.getElementById("bg-custom-picker");
    if (picker) picker.value = readCustom();
    var swatch = document.getElementById("bg-custom-swatch");
    if (swatch) swatch.style.setProperty("--swatch", readCustom());
  }

  function refreshNavLabel(getMode) {
    var mode = typeof getMode === "function" ? getMode() : "system";
    var label = document.getElementById("theme-toggle-label");
    if (label) label.textContent = "Theme";
    var btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.setAttribute("aria-pressed", mode === "system" ? "false" : "true");
      btn.title = "Theme settings";
    }
  }

  /**
   * @param {object} opts
   * @param {function(): string} opts.getMode
   * @param {function(string): void} opts.setMode
   * @param {function(string): void} [opts.showSheet]
   */
  function wire(opts) {
    opts = opts || {};
    var getMode = opts.getMode || function () { return "system"; };
    var setMode = opts.setMode || function () {};
    var showSheet = opts.showSheet || function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.add("open");
      var scrim = document.getElementById("scrim");
      if (scrim) scrim.classList.add("open");
    };

    applyBackground(readBg(), readCustom());
    refreshNavLabel(getMode);
    syncSheetUi(getMode);

    var themeBtn = document.getElementById("theme-toggle");
    if (themeBtn) {
      themeBtn.addEventListener("click", function () {
        syncSheetUi(getMode);
        showSheet("sheet-theme");
      });
    }

    document.querySelectorAll("[data-theme-opt]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var opt = btn.getAttribute("data-theme-opt");
        if (opt !== "system" && opt !== "light" && opt !== "dark") return;
        setMode(opt);
        refreshNavLabel(getMode);
        syncSheetUi(getMode);
      });
    });

    document.querySelectorAll("[data-bg-opt]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        var opt = btn.getAttribute("data-bg-opt");
        if (!BG_OK[opt]) return;
        if (opt === "custom") {
          var picker = document.getElementById("bg-custom-picker");
          if (picker && e.target !== picker) {
            try { picker.click(); } catch (err) { /* ignore */ }
          }
          setBackground("custom", picker ? picker.value : readCustom());
        } else {
          setBackground(opt, readCustom());
        }
        syncSheetUi(getMode);
      });
    });

    var picker = document.getElementById("bg-custom-picker");
    if (picker) {
      picker.addEventListener("input", function () {
        setBackground("custom", picker.value);
        syncSheetUi(getMode);
      });
      picker.addEventListener("change", function () {
        setBackground("custom", picker.value);
        syncSheetUi(getMode);
      });
    }
  }

  global.SeclusaThemeSheet = {
    KEY_BG: KEY_BG,
    KEY_BG_CUSTOM: KEY_BG_CUSTOM,
    readBg: readBg,
    readCustom: readCustom,
    applyBackground: applyBackground,
    setBackground: setBackground,
    syncSheetUi: syncSheetUi,
    refreshNavLabel: refreshNavLabel,
    wire: wire
  };
})(typeof window !== "undefined" ? window : this);
