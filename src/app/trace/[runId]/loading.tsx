import { SiteHeader } from "@/components/site/site-header";

export default function TraceLoading() {
  return (
    <div className="dark min-h-[100dvh] bg-background text-foreground">
      <SiteHeader active="/trace/latest" tag="agent trace" />
      <main className="mx-auto max-w-2xl px-5 py-12">
        <div className="animate-pulse">
          <div className="mt-2 h-9 w-72 max-w-full rounded-lg bg-secondary" />
          <div className="mt-3 h-4 w-96 max-w-full rounded-full bg-secondary" />

          <ol className="relative mt-10 space-y-px">
            <span
              className="absolute bottom-6 left-[19px] top-6 w-px bg-border"
              aria-hidden
            />
            {Array.from({ length: 5 }).map((_, index) => (
              <li key={index} className="relative flex gap-4 pb-7">
                <span className="relative z-10 size-10 shrink-0 rounded-full border border-border bg-card" />
                <div className="min-w-0 flex-1 pt-1">
                  <div className="h-3 w-36 rounded-full bg-secondary" />
                  <div className="mt-4 space-y-2">
                    <div className="h-4 w-full rounded-full bg-secondary" />
                    <div className="h-4 w-2/3 rounded-full bg-secondary" />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </main>
    </div>
  );
}
