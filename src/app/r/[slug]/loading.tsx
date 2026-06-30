import { SiteHeader } from "@/components/site/site-header";

export default function ReceiptLoading() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      <SiteHeader tag="License receipt" />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 py-12">
        <div className="animate-pulse">
          <div className="mt-2 flex items-center gap-2.5">
            <div className="size-9 rounded-full bg-secondary" />
            <div>
              <div className="h-4 w-44 rounded-full bg-secondary" />
              <div className="mt-2 h-3 w-56 rounded-full bg-secondary" />
            </div>
          </div>

          <div className="mt-6 h-10 w-full rounded-lg bg-secondary" />
          <div className="mt-3 h-4 w-4/5 rounded-full bg-secondary" />

          <section className="mt-8">
            <div className="mb-2 h-3 w-40 rounded-full bg-secondary" />
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="h-4 w-32 rounded-full bg-secondary" />
                    <div className="mt-2 h-3 w-20 rounded-full bg-secondary" />
                  </div>
                  <div className="h-4 w-16 rounded-full bg-secondary" />
                </div>
              ))}
            </div>
          </section>

          <section className="mt-8 space-y-3">
            <div className="mb-1 h-3 w-32 rounded-full bg-secondary" />
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2"
              >
                <div className="h-4 w-24 rounded-full bg-secondary" />
                <div className="h-4 w-40 rounded-full bg-secondary" />
              </div>
            ))}
          </section>
        </div>
      </main>
    </div>
  );
}
