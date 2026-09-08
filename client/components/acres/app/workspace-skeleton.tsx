import Link from "next/link";
import type { ReactNode } from "react";
import {
  BarChart3Icon,
  BriefcaseBusinessIcon,
  DatabaseIcon,
  FileTextIcon,
  LogOutIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "Workspace",
    href: "/app",
    icon: BriefcaseBusinessIcon,
    section: "workspace" as const,
  },
  {
    label: "Data Sets",
    href: "/app/datasets",
    icon: DatabaseIcon,
    section: "datasets" as const,
  },
  {
    label: "Dashboards",
    href: "/app/dashboards",
    icon: BarChart3Icon,
    section: "dashboards" as const,
  },
  {
    label: "Reports",
    href: "/app/reports",
    icon: FileTextIcon,
    section: "reports" as const,
  },
  {
    label: "Members",
    href: "/app/members",
    icon: ShieldCheckIcon,
    section: "members" as const,
  },
];

export interface WorkspaceHeaderSkeletonProps {
  eyebrowWidth?: string;
  headingWidth?: string;
  descriptionWidth?: string;
  hasAction?: boolean;
  actionWidth?: string;
  className?: string;
}

export function WorkspaceHeaderSkeleton({
  eyebrowWidth = "w-20",
  headingWidth = "w-64",
  descriptionWidth = "w-96",
  hasAction = false,
  actionWidth = "w-36",
  className,
}: WorkspaceHeaderSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading section header"
      data-slot="workspace-header-skeleton"
      className={cn("flex flex-col gap-4 border-b border-rule pb-5", className)}
    >
      <span className="sr-only">Loading section header...</span>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className={cn("h-3.5", eyebrowWidth)} />
          <Skeleton className={cn("h-8 sm:h-9", headingWidth)} />
          <Skeleton className={cn("h-4", descriptionWidth)} />
        </div>
        {hasAction && (
          <Skeleton
            className={cn("h-12 shrink-0 rounded-full", actionWidth)}
          />
        )}
      </div>
    </div>
  );
}

export interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  hasActions?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function TableSkeleton({
  rows = 5,
  columns = 4,
  hasActions = true,
  ariaLabel = "Loading table data",
  className,
}: TableSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={ariaLabel}
      data-slot="table-skeleton"
      className={cn("w-full min-w-0 space-y-4", className)}
    >
      <span className="sr-only">{ariaLabel}</span>

      {/* Desktop / Tablet Table View */}
      <div className="hidden w-full min-w-0 overflow-hidden rounded-[14px] border border-rule md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Skeleton className="h-4 w-28" />
              </TableHead>
              {Array.from({
                length: Math.max(1, columns - (hasActions ? 2 : 1)),
              }).map((_, colIdx) => (
                <TableHead key={colIdx}>
                  <Skeleton className={cn("h-4", colIdx % 2 === 0 ? "w-20" : "w-24")} />
                </TableHead>
              ))}
              {hasActions && (
                <TableHead className="text-right">
                  <Skeleton className="ml-auto h-4 w-16" />
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }).map((_, index) => (
              <TableRow key={index}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-8 shrink-0 rounded-full" />
                    <div className="space-y-1.5">
                      <Skeleton
                        className={cn(
                          "h-4",
                          index % 2 === 0 ? "w-36" : "w-48",
                        )}
                      />
                      <Skeleton className="h-3 w-28" />
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Skeleton className="h-6 w-20 rounded-full" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                {hasActions && (
                  <TableCell className="text-right">
                    <Skeleton className="ml-auto h-8 w-16 rounded-control" />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Stacked Card View (prevents horizontal scroll at 375px) */}
      <div className="grid gap-3 md:hidden">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="space-y-3 rounded-[14px] border border-rule bg-canvas p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <div className="space-y-1">
                  <Skeleton
                    className={cn(
                      "h-4",
                      index % 2 === 0 ? "w-32" : "w-40",
                    )}
                  />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="flex items-center justify-between border-t border-rule/60 pt-2 text-xs">
              <Skeleton className="h-3 w-20" />
              {hasActions && <Skeleton className="h-8 w-20 rounded-control" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface CardGridSkeletonProps {
  count?: number;
  columns?: 2 | 3 | 4;
  ariaLabel?: string;
  className?: string;
}

export function CardGridSkeleton({
  count = 3,
  columns = 3,
  ariaLabel = "Loading metrics",
  className,
}: CardGridSkeletonProps) {
  const gridColsClass =
    columns === 2
      ? "sm:grid-cols-2"
      : columns === 4
        ? "sm:grid-cols-2 lg:grid-cols-4"
        : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={ariaLabel}
      data-slot="card-grid-skeleton"
      className={cn("grid w-full min-w-0 gap-4", gridColsClass, className)}
    >
      <span className="sr-only">{ariaLabel}</span>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="space-y-4 rounded-[14px] border border-rule bg-canvas p-5 shadow-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="size-6 rounded-control" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-3.5 w-36" />
          </div>
          <Skeleton className="h-12 w-full rounded-md bg-muted/40" />
        </div>
      ))}
    </div>
  );
}

export interface WorkspaceShellSkeletonProps {
  children?: ReactNode;
  activeSection?: "workspace" | "datasets" | "dashboards" | "reports" | "members";
  ariaLabel?: string;
}

export function WorkspaceShellSkeleton({
  children,
  activeSection = "workspace",
  ariaLabel = "Loading workspace",
}: WorkspaceShellSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={ariaLabel}
      data-slot="workspace-skeleton"
      className="flex min-h-svh flex-col bg-canvas text-ink"
    >
      <span className="sr-only">{ariaLabel}</span>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-rule bg-canvas/95 px-4 py-4 backdrop-blur md:px-10">
        <div className="mx-auto grid max-w-page gap-4">
          <div className="flex min-w-0 items-center justify-between gap-4">
            <Link
              href="/"
              className="shrink-0 text-wordmark font-sans outline-none focus-visible:rounded-control focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              translate="no"
            >
              Acres
            </Link>
            <Badge variant="outline">Authenticated</Badge>
          </div>
          <dl className="grid gap-3 border-t border-rule pt-4 font-mono text-label text-ink-muted sm:grid-cols-3 lg:text-label-lg">
            <div className="min-w-0 space-y-1">
              <dt>Account</dt>
              <dd>
                <Skeleton className="h-4 w-36" />
              </dd>
            </div>
            <div className="min-w-0 space-y-1">
              <dt>Organization</dt>
              <dd>
                <Skeleton className="h-4 w-32" />
              </dd>
            </div>
            <div className="min-w-0 space-y-1">
              <dt>Role</dt>
              <dd>
                <Skeleton className="h-4 w-16" />
              </dd>
            </div>
          </dl>
        </div>
      </header>

      {/* Main Grid */}
      <div className="mx-auto grid w-full max-w-page flex-1 gap-6 px-4 py-6 md:grid-cols-[16rem_minmax(0,1fr)] md:px-10 md:py-8">
        <aside className="grid content-start gap-5 border-b border-rule pb-5 md:border-r md:border-b-0 md:pr-6 md:pb-0">
          <Skeleton className="h-10 w-full rounded-control" />
          <nav aria-label="Application Skeleton" className="grid gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.section === activeSection;
              return (
                <div
                  key={item.label}
                  className={cn(
                    buttonVariants({
                      variant: active ? "secondary" : "ghost",
                      size: "lg",
                    }),
                    "h-target justify-between gap-3 pointer-events-none",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon aria-hidden="true" className="size-4 text-ink-muted" />
                    <span className="truncate text-ink-muted">{item.label}</span>
                  </span>
                  <Badge variant={active ? "secondary" : "outline"}>
                    {active ? "Active" : "..."}
                  </Badge>
                </div>
              );
            })}
          </nav>
          <div className="mt-2 flex h-target items-center gap-2 rounded-control border border-rule/60 px-4 text-ink-muted">
            <LogOutIcon className="size-4" aria-hidden="true" />
            <Skeleton className="h-4 w-20" />
          </div>
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
