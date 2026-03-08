(function () {
  /* ── Theme Toggle ── */
  var storageKey = "davvy-theme";
  var allowed = new Set(["system", "light", "dark"]);
  var toggle = document.getElementById("theme-toggle");
  var icon = document.getElementById("theme-icon");

  var moonIcon =
    '<path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />';
  var sunIcon = [
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

  function getSystemTheme() {
    if (!window.matchMedia) return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function normalizeTheme(value) {
    return allowed.has(value) ? value : "system";
  }

  function resolveTheme(theme) {
    return theme === "system" ? getSystemTheme() : theme;
  }

  function applyTheme(theme) {
    var resolved = resolveTheme(theme);
    var root = document.documentElement;

    root.classList.toggle("dark", resolved === "dark");
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;

    if (icon) {
      var isDark = resolved === "dark";
      icon.innerHTML = isDark ? sunIcon : moonIcon;
      if (toggle) {
        toggle.setAttribute(
          "aria-label",
          isDark ? "Switch to light theme" : "Switch to dark theme"
        );
        toggle.setAttribute(
          "title",
          isDark ? "Switch to light theme" : "Switch to dark theme"
        );
      }
    }
  }

  function currentTheme() {
    try {
      return normalizeTheme(window.localStorage.getItem(storageKey));
    } catch (e) {
      return "system";
    }
  }

  function saveTheme(theme) {
    try {
      if (theme === "system") {
        window.localStorage.removeItem(storageKey);
      } else {
        window.localStorage.setItem(storageKey, theme);
      }
    } catch (e) {}
  }

  function nextTheme() {
    var resolved = resolveTheme(currentTheme());
    var target = resolved === "dark" ? "light" : "dark";
    return target === getSystemTheme() ? "system" : target;
  }

  applyTheme(currentTheme());

  if (toggle) {
    toggle.addEventListener("click", function () {
      var theme = nextTheme();
      saveTheme(theme);
      applyTheme(theme);
    });
  }

  if (window.matchMedia) {
    var media = window.matchMedia("(prefers-color-scheme: dark)");
    var syncSystemTheme = function () {
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

  /* ── Scroll Reveal (IntersectionObserver) ── */
  if ("IntersectionObserver" in window) {
    var revealElements = document.querySelectorAll(".reveal");
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );

    revealElements.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    // Fallback: show everything immediately
    document.querySelectorAll(".reveal").forEach(function (el) {
      el.classList.add("revealed");
    });
  }
})();
