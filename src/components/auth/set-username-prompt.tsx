"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

/**
 * Prompts a signed-in user who hasn't chosen a username yet. Shown once their
 * session resolves with no `username`; on success it reloads so the new handle
 * appears everywhere. A focus-trapped modal dialog (it's mandatory, so there's
 * no dismiss). Self-contained — mount it inside the authed shell.
 */
export function SetUsernamePrompt() {
  const [needs, setNeeds] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user && !d.user.username) setNeeds(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (needs) dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [needs]);

  if (!needs) return null;

  function trapFocus(e: KeyboardEvent) {
    if (e.key !== "Tab") return;
    const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
      'input,button:not([disabled]),[href]',
    );
    if (!nodes || nodes.length === 0) return;
    const list = Array.from(nodes);
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: value }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(
          d.error === "username_taken"
            ? "That username is taken — try another."
            : d.hint ?? "Invalid username.",
        );
        return;
      }
      window.location.reload();
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-5 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="username-title"
        aria-describedby="username-hint"
        onKeyDown={trapFocus}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <h2 id="username-title" className="font-display text-2xl tracking-tight">
          Choose a username
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Pick a unique handle — it&apos;s how you show up on Findling.
        </p>
        <form onSubmit={submit} className="mt-5">
          <label htmlFor="username-input" className="sr-only">
            Username
          </label>
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-2.5 focus-within:border-sage">
            <span aria-hidden className="text-sm text-muted-foreground">
              @
            </span>
            <input
              id="username-input"
              name="username"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              value={value}
              onChange={(e) =>
                setValue(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
              }
              placeholder="username"
              maxLength={20}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "username-error" : "username-hint"}
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <p id="username-hint" className="mt-1.5 text-xs text-muted-foreground">
            3–20 characters · a–z, 0–9, underscore
          </p>
          {error && (
            <p id="username-error" role="alert" className="mt-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || value.length < 3}
            className="mt-4 w-full rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? "Saving…" : "Set username"}
          </button>
        </form>
      </div>
    </div>
  );
}
