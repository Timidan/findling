import Link from "next/link";
import {
  Lightning,
  Receipt,
  ArrowSquareOut,
} from "@phosphor-icons/react/dist/ssr";
import type { RecentLicense } from "@/server/catalog/studio";
import { UsdcAmount } from "@/components/brand/usdc";
import { formatDateTime } from "@/lib/format";

const ROLE_LABEL: Record<RecentLicense["role"], string> = {
  creator: "your clip",
  finder: "you found it",
  both: "your clip · you found it",
};

/**
 * A time-ordered ledger of the most recent settled licenses this creator/finder
 * earned from. Gives the studio pages a real terminal "activity" beat instead of
 * empty space, and falls back to a composed empty state for new creators.
 */
export function RecentLicenses({ licenses }: { licenses: RecentLicense[] }) {
  return (
    <section className="mt-10">
      <h2 className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
        Recent licenses
      </h2>
      {licenses.length === 0 ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-secondary text-sage">
            <Receipt weight="duotone" aria-hidden className="size-5" />
          </span>
          <p className="text-sm font-medium">No licenses yet</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            When an agent licenses one of your moments, the sale and your USDC split land here.
          </p>
        </div>
      ) : (
        <div className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {licenses.map((l) => {
            const inner = (
              <>
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sage/15 text-sage">
                  <Lightning weight="fill" aria-hidden className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {l.momentTitle}
                    {l.receiptSlug && (
                      <ArrowSquareOut
                        weight="bold"
                        aria-hidden
                        className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    )}
                  </p>
                  <p className="tabular mt-0.5 truncate text-xs text-muted-foreground">
                    {l.viaAgent ? "licensed by an agent" : "licensed"} · {ROLE_LABEL[l.role]} ·{" "}
                    {formatDateTime(l.at)}
                    {l.receiptSlug ? " · receipt" : ""}
                  </p>
                </div>
                <UsdcAmount
                  micro={l.yourShareMicroUsdc}
                  sign="+"
                  className="tabular shrink-0 gap-0.5 text-sm font-semibold text-sage"
                />
              </>
            );
            return l.receiptSlug ? (
              <Link
                key={l.purchaseId}
                href={`/r/${l.receiptSlug}`}
                className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-secondary/40"
              >
                {inner}
              </Link>
            ) : (
              <div
                key={l.purchaseId}
                className="group flex items-center gap-4 px-4 py-3"
              >
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
