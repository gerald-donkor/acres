import {
  TableSkeleton,
  WorkspaceHeaderSkeleton,
  WorkspaceShellSkeleton,
} from "@/components/acres/app/workspace-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function MembersLoading() {
  return (
    <WorkspaceShellSkeleton
      activeSection="members"
      ariaLabel="Loading members administration"
    >
      <section
        aria-label="Loading member management"
        className="grid gap-6"
      >
        <WorkspaceHeaderSkeleton
          eyebrowWidth="w-24"
          headingWidth="w-64"
          descriptionWidth="w-full max-w-lg"
        />

        {/* Invite Member Section Skeleton */}
        <div className="w-full min-w-0 rounded-[14px] border border-rule bg-card p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-rule pb-4">
            <Skeleton className="size-5 rounded-xs" />
            <Skeleton className="h-6 w-44" />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_12rem_auto] lg:items-end">
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-11 w-full rounded-md" />
            </div>
            <div className="space-y-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-11 w-full rounded-md" />
            </div>
            <div className="pt-2 lg:pt-0">
              <Skeleton className="h-11 min-h-[44px] w-full rounded-full lg:w-36" />
            </div>
          </div>
        </div>

        {/* Active Members Table Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-rule pb-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-5 rounded-xs" />
              <Skeleton className="h-6 w-36" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <TableSkeleton
            rows={5}
            columns={4}
            hasActions={true}
            ariaLabel="Loading active members table"
          />
        </div>

        {/* Pending Invitations Table Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-rule pb-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-5 rounded-xs" />
              <Skeleton className="h-6 w-40" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <TableSkeleton
            rows={2}
            columns={4}
            hasActions={true}
            ariaLabel="Loading pending invitations table"
          />
        </div>
      </section>
    </WorkspaceShellSkeleton>
  );
}
