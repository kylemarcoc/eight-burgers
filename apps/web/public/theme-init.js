(function () {
  var theme = 'light';
  try {
    var saved = window.localStorage.getItem('menu-kiosk-theme');
    if (saved !== 'light' && saved !== 'dark') {
      var legacySaved = window.localStorage.getItem('eight-burgers-theme');
      if (legacySaved === 'light' || legacySaved === 'dark') {
        saved = legacySaved;
        window.localStorage.setItem('menu-kiosk-theme', legacySaved);
      }
      if (legacySaved !== null) {
        window.localStorage.removeItem('eight-burgers-theme');
      }
    }
    if (saved === 'light' || saved === 'dark') {
      theme = saved;
    } else if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      theme = 'dark';
    }
  } catch {
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      theme = 'dark';
    }
  }
  var root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.dataset.uiTheme = theme;
  try {
    var rawAccent = window.localStorage.getItem('menu-kiosk-accent');
    if (rawAccent) {
      var parsed = JSON.parse(rawAccent);
      var palette = parsed && parsed[theme];
      var isHex = function (v) {
        return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
      };
      if (
        palette &&
        isHex(palette.accent) &&
        isHex(palette.accentHover) &&
        isHex(palette.onAccent) &&
        isHex(palette.focusColor)
      ) {
        root.style.setProperty('--ui-accent', palette.accent);
        root.style.setProperty('--ui-accent-hover', palette.accentHover);
        root.style.setProperty('--ui-on-accent', palette.onAccent);
        root.style.setProperty('--ui-focus-color', palette.focusColor);
      }
    }
  } catch {
    // Ignore invalid or blocked localStorage snapshots.
  }
})();
