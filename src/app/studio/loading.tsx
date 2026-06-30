export default function StudioLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:py-10">
      <div className="animate-pulse">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="h-3 w-20 rounded-full bg-secondary" />
            <div className="mt-3 h-10 w-64 max-w-full rounded-lg bg-secondary" />
            <div className="mt-3 flex gap-2">
              <div className="h-4 w-24 rounded-full bg-secondary" />
              <div className="h-4 w-16 rounded-full bg-secondary" />
              <div className="h-4 w-28 rounded-full bg-secondary" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-40 rounded-full bg-secondary" />
            <div className="h-10 w-32 rounded-full bg-secondary" />
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="bg-card px-4 py-4">
              <div className="h-3 w-20 rounded-full bg-secondary" />
              <div className="mt-3 h-7 w-24 rounded-lg bg-secondary" />
              <div className="mt-3 h-3 w-16 rounded-full bg-secondary" />
            </div>
          ))}
        </div>

        <div className="mt-10">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div className="h-3 w-32 rounded-full bg-secondary" />
            <div className="h-4 w-16 rounded-full bg-secondary" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="flex gap-4 rounded-2xl border border-border bg-card p-4"
              >
                <div className="aspect-[9/12] w-24 shrink-0 rounded-xl bg-secondary" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="h-6 w-36 rounded-lg bg-secondary" />
                    <div className="h-5 w-16 rounded-full bg-secondary" />
                  </div>
                  <div className="mt-3 h-3 w-44 max-w-full rounded-full bg-secondary" />
                  <div className="mt-auto flex items-end justify-between gap-2 pt-8">
                    <div>
                      <div className="h-3 w-12 rounded-full bg-secondary" />
                      <div className="mt-2 h-4 w-16 rounded-full bg-secondary" />
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="h-3 w-16 rounded-full bg-secondary" />
                      <div className="mt-2 h-4 w-12 rounded-full bg-secondary" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
