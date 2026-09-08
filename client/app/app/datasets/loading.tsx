import {
  TableSkeleton,
  WorkspaceHeaderSkeleton,
  WorkspaceShellSkeleton,
} from "@/components/acres/app/workspace-skeleton";

export default function DatasetsLoading() {
  return (
    <WorkspaceShellSkeleton
      activeSection="datasets"
      ariaLabel="Loading datasets"
    >
      <section
        aria-label="Loading datasets"
        className="grid gap-6"
      >
        <WorkspaceHeaderSkeleton
          eyebrowWidth="w-24"
          headingWidth="w-48"
          descriptionWidth="w-full max-w-lg"
          hasAction={true}
          actionWidth="w-36"
        />

        <TableSkeleton
          rows={5}
          columns={4}
          hasActions={true}
          ariaLabel="Loading datasets registry"
        />
      </section>
    </WorkspaceShellSkeleton>
  );
}
