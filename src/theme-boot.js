/*
 * Seclusa Notes theme boot — sets the saved appearance before the first paint.
 *
 * Same contract as shared/templates/seclusa-app/static/js/theme-boot.js: run
 * synchronously in <head> ahead of the stylesheets, never throw, never assume
 * storage exists. The markup default is data-theme="light"; this corrects it
 * before anything that reads the attribute can paint.
 */
(function () {
  var KEY_THEME = "ssc.pref_key_night_mode";
  var LEGACY_KEY = "privacy_calendar_theme";

  function readPref() {
    try {
      var v = localStorage.getItem(KEY_THEME);
      if (v === "light" || v === "dark") return v;
      // One-time move from the old combined-app key (bw/dark/light).
      var legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy === "light") return "light";
      if (legacy === "dark" || legacy === "bw") return "dark";
      return null;
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
  } catch (err) {
    /* Storage blocked, or no matchMedia. The light default in the markup stands. */
  }
})();
