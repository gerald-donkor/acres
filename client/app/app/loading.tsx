import {
  CardGridSkeleton,
  WorkspaceHeaderSkeleton,
  WorkspaceShellSkeleton,
} from "@/components/acres/app/workspace-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <WorkspaceShellSkeleton
      activeSection="workspace"
      ariaLabel="Loading workspace overview"
    >
      <section
        aria-label="Loading workspace overview"
        className="grid gap-6"
      >
        <WorkspaceHeaderSkeleton
          eyebrowWidth="w-20"
          headingWidth="w-72"
          descriptionWidth="w-full max-w-xl"
        />

        <dl className="grid gap-3 border-y border-rule py-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="grid gap-1 py-1.5 sm:grid-cols-[12rem_minmax(0,1fr)]"
            >
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-48" />
            </div>
          ))}
        </dl>

        <div>
          <h2 className="sr-only">Quick Actions</h2>
          <CardGridSkeleton
            count={3}
            columns={3}
            ariaLabel="Loading quick actions"
          />
        </div>
      </section>
    </WorkspaceShellSkeleton>
  );
}
