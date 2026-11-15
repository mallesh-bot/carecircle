/** Skeleton shown while the dashboard's data loads. */
export default function Loading() {
  return (
    <main id="main" aria-busy="true" className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
      <p className="sr-only" role="status">
        Loading your care circle…
      </p>
      <div className="h-10 w-64 animate-pulse rounded-xl bg-stone-200" />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="h-80 animate-pulse rounded-2xl bg-stone-200" />
        <div className="h-80 animate-pulse rounded-2xl bg-stone-200" />
      </div>
    </main>
  );
}
