"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Sun, Moon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type Mode = "light" | "dark";

const STORAGE_KEY = "findling-theme";

/**
 * App-wide light/dark switch. The source of truth is the `.dark` class on
 * `<html>` (set pre-paint by the init script in the root layout). We read it as
 * external state via `useSyncExternalStore` — no effect, hydration-safe, and it
 * stays in sync if any other toggle instance or another tab changes it.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  window.addEventListener("storage", onChange);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): Mode {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

// Server (and first hydration pass) assumes the dark default; the client snaps
// to the real stored mode right after, without a hydration mismatch.
function getServerSnapshot(): Mode {
  return "dark";
}

export function ThemeToggle({
  className,
  variant = "ghost",
}: {
  className?: string;
  variant?: "ghost" | "bordered";
}) {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const d = document.documentElement;
    const next: Mode = d.classList.contains("dark") ? "light" : "dark";
    d.classList.toggle("dark", next === "dark");
    d.style.colorScheme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode / blocked storage — non-fatal */
    }
  }, []);

  const isDark = mode === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground",
        variant === "bordered"
          ? "border border-border bg-card hover:bg-secondary/60"
          : "hover:bg-secondary/60",
        className,
      )}
    >
      {isDark ? (
        <Sun weight="fill" className="size-[1.05rem]" />
      ) : (
        <Moon weight="fill" className="size-[1.05rem]" />
      )}
    </button>
  );
}
