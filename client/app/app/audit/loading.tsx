import { Skeleton } from "@/components/ui/skeleton";

export default function AuditLoading() {
  return (
    <section
      role="status"
      aria-busy="true"
      aria-label="Loading audit history…"
      className="mx-auto grid w-full max-w-page gap-6 px-4 py-10 md:px-10"
    >
      <span className="sr-only">Loading audit history…</span>
      <div aria-hidden="true" className="grid gap-4">
        <Skeleton className="h-8 w-48" />
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-32 w-full rounded-card" />
        ))}
      </div>
    </section>
  );
}
