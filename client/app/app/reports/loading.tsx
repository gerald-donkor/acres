import {
  TableSkeleton,
  WorkspaceHeaderSkeleton,
  WorkspaceShellSkeleton,
} from "@/components/acres/app/workspace-skeleton";

export default function ReportsLoading() {
  return (
    <WorkspaceShellSkeleton
      activeSection="reports"
      ariaLabel="Loading reports"
    >
      <section
        aria-label="Loading reports"
        className="grid gap-6"
      >
        <WorkspaceHeaderSkeleton
          eyebrowWidth="w-24"
          headingWidth="w-52"
          descriptionWidth="w-full max-w-lg"
          hasAction={true}
          actionWidth="w-32"
        />

        <TableSkeleton
          rows={4}
          columns={4}
          hasActions={true}
          ariaLabel="Loading report drafts and export requests"
        />
      </section>
    </WorkspaceShellSkeleton>
  );
}
