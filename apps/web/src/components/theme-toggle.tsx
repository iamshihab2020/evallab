"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const KEY = "evallab.theme";
type Theme = "dark" | "light";

function applyTheme(theme: Theme) {
  const html = document.documentElement;
  html.classList.toggle("light", theme === "light");
  html.classList.toggle("dark", theme === "dark");
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(KEY) as Theme | null;
    const initial: Theme = stored ?? "dark";
    setTheme(initial);
    applyTheme(initial);
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    localStorage.setItem(KEY, next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      className="relative inline-flex h-7 w-12 items-center rounded-full border border-border bg-card transition-colors hover:border-foreground/30"
    >
      <span
        className="absolute left-0.5 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background transition-transform duration-300"
        style={{
          transform: `translate(${mounted && theme === "light" ? "20px" : "0"}, -50%)`,
        }}
      >
        {theme === "dark" ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
      </span>
    </button>
  );
}

/** Inline script — sets the right class before React hydrates to avoid flash. */
export function ThemeNoFlashScript() {
  const code = `(function(){try{var t=localStorage.getItem('${KEY}');if(!t){t='dark';}document.documentElement.classList.toggle('light',t==='light');document.documentElement.classList.toggle('dark',t==='dark');}catch(e){document.documentElement.classList.add('dark');}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
