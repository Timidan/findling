/**
 * Shared, hydration-safe formatters. Money + dates use a FIXED locale ("en-US")
 * on purpose: these render in both server and client components, so a fixed
 * locale guarantees the server-rendered string matches the client hydration
 * (a runtime/browser locale could differ and trip a hydration mismatch).
 * Intl gives us thousands separators that toFixed/raw never did.
 */
// Precision-aware: at least 3 dp (the familiar money look for round amounts like
// 0.056 / 0.360) but up to 6 dp (USDC's native precision) so a non-round split
// leg — e.g. a 12% finder share of $0.07 = 0.0084 — renders EXACTLY and still
// reconciles with its stated percentage. Never truncate a canonical money leg.
const USDC_FMT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 6,
});

/** Format a plain USDC amount (already divided out of micro), exact to 6 dp. */
export function formatUsdc(amount: number): string {
  return USDC_FMT.format(amount);
}

/** Format an integer micro-USDC amount exactly (1 USDC = 1_000_000 micro). */
export function formatMicroUsdc(micro: number): string {
  return USDC_FMT.format(micro / 1_000_000);
}

const DATE_TIME_FMT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

/** Format a settlement / withdrawal timestamp. */
export function formatDateTime(value: Date | string | number): string {
  return DATE_TIME_FMT.format(new Date(value));
}

/** Format a calendar date without depending on the runtime/browser locale. */
export function formatDate(value: Date | string | number): string {
  return DATE_FMT.format(new Date(value));
}
