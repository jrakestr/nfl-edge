"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import { THEME_KEY } from "@/lib/config";

const THEME_EVENT = "nfl-edge-theme";

export type ThemeMode = "light" | "dark" | "system";

function readMode(): ThemeMode {
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

function subscribe(cb: () => void) {
  window.addEventListener(THEME_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(THEME_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function apply(mode: ThemeMode) {
  if (mode === "system") {
    localStorage.removeItem(THEME_KEY);
    document.documentElement.removeAttribute("data-theme");
  } else {
    localStorage.setItem(THEME_KEY, mode);
    document.documentElement.setAttribute("data-theme", mode);
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

const NEXT: Record<ThemeMode, ThemeMode> = { system: "light", light: "dark", dark: "system" };

const ICON = { system: Monitor, light: Sun, dark: Moon };

/** Cycles system → light → dark. Stored choice wins; unset follows the OS. */
export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, readMode, () => "system" as ThemeMode);
  const Icon = ICON[mode];
  const onClick = useCallback(() => apply(NEXT[mode]), [mode]);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Theme: ${mode}`}
      title={`Theme: ${mode}`}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <Icon size={16} strokeWidth={1.5} aria-hidden />
    </button>
  );
}
