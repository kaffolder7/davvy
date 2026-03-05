(function () {
  const storageKey = "davvy-theme";
  const allowed = new Set(["system", "light", "dark"]);
  const toggle = document.getElementById("theme-toggle");
  const icon = document.getElementById("theme-icon");

  if (!toggle || !icon) {
    return;
  }

  const moonIcon =
    '<path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />';
  const sunIcon = [
    '<circle cx="12" cy="12" r="5" />',
    '<line x1="12" y1="1" x2="12" y2="3" />',
    '<line x1="12" y1="21" x2="12" y2="23" />',
    '<line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />',
    '<line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />',
    '<line x1="1" y1="12" x2="3" y2="12" />',
    '<line x1="21" y1="12" x2="23" y2="12" />',
    '<line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />',
    '<line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />',
  ].join("");

  const getSystemTheme = () => {
    if (!window.matchMedia) {
      return "light";
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  };

  const normalizeTheme = (value) => (allowed.has(value) ? value : "system");

  const resolveTheme = (theme) => (theme === "system" ? getSystemTheme() : theme);

  const applyTheme = (theme) => {
    const resolved = resolveTheme(theme);
    const root = document.documentElement;

    root.classList.toggle("dark", resolved === "dark");
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;

    const isDark = resolved === "dark";
    icon.innerHTML = isDark ? sunIcon : moonIcon;
    toggle.classList.toggle("theme-control-toggle-dark", isDark);
    toggle.setAttribute(
      "aria-label",
      isDark ? "Switch to light theme" : "Switch to dark theme",
    );
    toggle.setAttribute(
      "title",
      isDark ? "Switch to light theme" : "Switch to dark theme",
    );
  };

  const currentTheme = () => {
    try {
      return normalizeTheme(window.localStorage.getItem(storageKey));
    } catch {
      return "system";
    }
  };

  const saveTheme = (theme) => {
    try {
      if (theme === "system") {
        window.localStorage.removeItem(storageKey);
      } else {
        window.localStorage.setItem(storageKey, theme);
      }
    } catch {
      // Ignore storage failures.
    }
  };

  const nextTheme = () => {
    const resolved = resolveTheme(currentTheme());
    const target = resolved === "dark" ? "light" : "dark";

    return target === getSystemTheme() ? "system" : target;
  };

  applyTheme(currentTheme());

  toggle.addEventListener("click", () => {
    const theme = nextTheme();
    saveTheme(theme);
    applyTheme(theme);
  });

  if (window.matchMedia) {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => {
      if (currentTheme() === "system") {
        applyTheme("system");
      }
    };

    if (media.addEventListener) {
      media.addEventListener("change", syncSystemTheme);
    } else if (media.addListener) {
      media.addListener(syncSystemTheme);
    }
  }
})();
