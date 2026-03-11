import React from "react";
import ThemeControl from "../theme/ThemeControl";

export default function AuthShell({
  theme,
  title,
  subtitle,
  children,
  themeControlPlacement = "inline",
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4 py-10">
      <section className="surface fade-up w-full rounded-3xl p-8">
        <h1 className="text-3xl font-bold text-app-strong">{title}</h1>
        <p className="mt-2 text-sm text-app-muted">{subtitle}</p>
        <div className="mt-6">{children}</div>
        {themeControlPlacement === "inline" ? (
          <div className="mt-6 flex justify-center sm:justify-end">
            <ThemeControl
              theme={theme.theme}
              setTheme={theme.setTheme}
              className="theme-control-inline"
            />
          </div>
        ) : null}
      </section>
      {themeControlPlacement === "window-bottom-right" ? (
        <ThemeControl
          theme={theme.theme}
          setTheme={theme.setTheme}
          className="theme-control-window-bottom-right"
        />
      ) : null}
    </main>
  );
}
