import {
  CardGridSkeleton,
  TableSkeleton,
  WorkspaceHeaderSkeleton,
  WorkspaceShellSkeleton,
} from "@/components/acres/app/workspace-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardsLoading() {
  return (
    <WorkspaceShellSkeleton
      activeSection="dashboards"
      ariaLabel="Loading dashboards"
    >
      <section
        aria-label="Loading dashboards"
        className="grid gap-6"
      >
        <WorkspaceHeaderSkeleton
          eyebrowWidth="w-20"
          headingWidth="w-56"
          descriptionWidth="w-full max-w-lg"
        />

        {/* 3 Summary Stat Placeholders */}
        <div className="grid gap-3 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border border-rule p-4 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>

        {/* Chart Card and Saved Views Skeleton */}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <div className="border border-rule p-5 space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-44" />
              <Skeleton className="h-8 w-28 rounded-control" />
            </div>
            <Skeleton className="h-64 w-full rounded-md" />
          </div>

          <div className="border border-rule p-5 space-y-3">
            <Skeleton className="h-6 w-32" />
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-control" />
            ))}
          </div>
        </div>

        {/* 4 Metric / Chart Cards */}
        <div>
          <h2 className="sr-only">Analytics Metrics</h2>
          <CardGridSkeleton
            count={4}
            columns={4}
            ariaLabel="Loading metrics grid"
          />
        </div>

        {/* Observations Table Skeleton */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-rule pb-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-5 w-20" />
          </div>
          <TableSkeleton
            rows={4}
            columns={4}
            hasActions={false}
            ariaLabel="Loading observations table"
          />
        </div>
      </section>
    </WorkspaceShellSkeleton>
  );
}
