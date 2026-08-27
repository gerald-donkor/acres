"use client";

import Link from "next/link";
import { useEffect } from "react";
import type {
  AccountProfile,
  OrganizationRole,
  OrganizationSummary,
} from "@acres/shared";
import type { ReactNode } from "react";
import {
  BarChart3Icon,
  BriefcaseBusinessIcon,
  ClipboardListIcon,
  DatabaseIcon,
  FileTextIcon,
  ShieldCheckIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { CreateOrganizationForm } from "@/components/acres/app/create-organization-form";
import { LogoutButton } from "@/components/acres/app/logout-button";
import { NewOrganizationForm } from "@/components/acres/app/new-organization-form";
import { OrganizationSwitcher } from "@/components/acres/app/organization-switcher";
import { persistActiveOrganization } from "@/lib/app/active-organization";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AppShellProps = {
  account: AccountProfile;
  organizations: OrganizationSummary[];
  activeOrganization: OrganizationSummary | null;
  activeSection?: "workspace" | "datasets" | "dashboards" | "reports";
  children?: ReactNode;
};

const roleLabel: Record<OrganizationRole, string> = {
  owner: "Owner",
  admin: "Admin",
  analyst: "Analyst",
  viewer: "Viewer",
};

const navItems: Array<{
  label: string;
  status: "Active" | "Unavailable";
  href: string | null;
  icon: LucideIcon;
  roles: OrganizationRole[];
}> = [
  {
    label: "Workspace",
    status: "Active",
    href: "/app",
    icon: BriefcaseBusinessIcon,
    roles: ["owner", "admin", "analyst", "viewer"],
  },
  {
    label: "Data Sets",
    status: "Active",
    href: "/app/datasets",
    icon: DatabaseIcon,
    roles: ["owner", "admin", "analyst", "viewer"],
  },
  {
    label: "Dashboards",
    status: "Active",
    href: "/app/dashboards",
    icon: BarChart3Icon,
    roles: ["owner", "admin", "analyst", "viewer"],
  },
  {
    label: "Reports",
    status: "Active",
    href: "/app/reports",
    icon: FileTextIcon,
    roles: ["owner", "admin", "analyst", "viewer"],
  },
  {
    label: "Members",
    status: "Unavailable",
    href: null,
    icon: ShieldCheckIcon,
    roles: ["owner", "admin"],
  },
];

function Ledger({
  account,
  activeOrganization,
}: {
  account: AccountProfile;
  activeOrganization: OrganizationSummary | null;
}) {
  return (
    <dl className="grid gap-3 border-t border-rule pt-4 font-mono text-label text-ink-muted sm:grid-cols-3 lg:text-label-lg">
      <div className="min-w-0">
        <dt>Account</dt>
        <dd className="truncate text-ink">{account.email}</dd>
      </div>
      <div className="min-w-0">
        <dt>Organization</dt>
        <dd aria-label="Current organization" className="truncate text-ink">
          {activeOrganization?.name ?? "Not created"}
        </dd>
      </div>
      <div className="min-w-0">
        <dt>Role</dt>
        <dd className="text-ink">
          {activeOrganization ? roleLabel[activeOrganization.membership.role] : "None"}
        </dd>
      </div>
    </dl>
  );
}

function WorkNavigation({
  role,
  activeSection,
}: {
  role: OrganizationRole | null;
  activeSection: "workspace" | "datasets" | "dashboards" | "reports";
}) {
  const visible = navItems.filter((item) => role === null || item.roles.includes(role));
  return (
    <nav aria-label="Application" className="grid gap-2">
      {visible.map((item) => {
        const Icon = item.icon;
        const active =
          (activeSection === "workspace" && item.href === "/app") ||
          (activeSection === "datasets" && item.href === "/app/datasets") ||
          (activeSection === "dashboards" && item.href === "/app/dashboards") ||
          (activeSection === "reports" && item.href === "/app/reports");
        const enabled = item.status === "Active" && item.href !== null;
        const href = item.href;
        const content = (
          <>
            <span className="flex min-w-0 items-center gap-2">
              <Icon aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </span>
            <Badge variant={active ? "secondary" : "outline"}>
              {item.status}
            </Badge>
          </>
        );
        return enabled && href !== null ? (
          <Link
            key={item.label}
            href={href}
            className={cn(
              buttonVariants({ variant: active ? "secondary" : "ghost", size: "lg" }),
              "h-target justify-between gap-3",
            )}
            aria-current={active ? "page" : undefined}
          >
            {content}
          </Link>
        ) : (
          <button
            key={item.label}
            type="button"
            disabled
            className={cn(
              buttonVariants({ variant: "ghost", size: "lg" }),
              "h-target justify-between gap-3 opacity-50",
            )}
          >
            {content}
          </button>
        );
      })}
    </nav>
  );
}

function WorkspaceOverview({
  account,
  activeOrganization,
}: {
  account: AccountProfile;
  activeOrganization: OrganizationSummary;
}) {
  const rows = [
    ["Account", account.displayName ?? account.email],
    ["Email", account.email],
    ["Organization", activeOrganization.name],
    ["Membership", roleLabel[activeOrganization.membership.role]],
    ["Created", formatIsoDate(activeOrganization.createdAt)],
  ];

  return (
    <section aria-labelledby="workspace-title" className="grid gap-6">
      <div className="border-b border-rule pb-5">
        <p className="font-mono text-label uppercase text-brand lg:text-label-lg">
          Workspace
        </p>
        <h1 id="workspace-title" className="mt-2 font-serif text-title text-ink">
          Organization shell is ready.
        </h1>
        <p className="mt-3 max-w-2xl text-body text-ink-muted">
          This foundation confirms the authenticated account, organization
          context, role, and same-origin API connection. Product analytics
          surfaces remain unavailable until their phases are built.
        </p>
      </div>
      <dl className="grid gap-3">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="grid gap-1 border-b border-rule py-3 sm:grid-cols-[12rem_minmax(0,1fr)]"
          >
            <dt className="font-mono text-label uppercase text-ink-muted lg:text-label-lg">
              {label}
            </dt>
            <dd
              aria-label={
                label === "Organization" ? "Current organization" : undefined
              }
              className="min-w-0 truncate text-body text-ink"
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "Data Sets",
            href: "/app/datasets",
            description: "Upload, map, and publish source data files.",
          },
          {
            label: "Dashboards",
            href: "/app/dashboards",
            description: "Explore regional analytics and metrics.",
          },
          {
            label: "Reports",
            href: "/app/reports",
            description: "Publish evidence-backed reports and exports.",
          },
        ].map((item) => (
          <div key={item.label} className="border border-rule p-4">
            <div className="flex items-center justify-between gap-3">
              <Link
                href={item.href}
                className="text-ui text-ink underline-offset-4 hover:underline"
              >
                {item.label}
              </Link>
              <Badge variant="secondary">Active</Badge>
            </div>
            <p className="mt-3 text-body text-ink-muted">
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AppShell({
  account,
  organizations,
  activeOrganization,
  activeSection = "workspace",
  children,
}: AppShellProps) {
  const role = activeOrganization?.membership.role ?? null;

  useEffect(() => {
    if (activeOrganization) {
      persistActiveOrganization(activeOrganization.id);
    }
  }, [activeOrganization]);

  return (
    <div className="flex min-h-svh flex-col bg-canvas text-ink">
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
          <Ledger account={account} activeOrganization={activeOrganization} />
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-page flex-1 gap-6 px-4 py-6 md:grid-cols-[16rem_minmax(0,1fr)] md:px-10 md:py-8">
        <aside className="grid content-start gap-5 border-b border-rule pb-5 md:border-r md:border-b-0 md:pr-6 md:pb-0">
          {organizations.length > 0 && activeOrganization && (
            <OrganizationSwitcher
              organizations={organizations}
              activeOrganizationId={activeOrganization.id}
            />
          )}
          <details className="group md:hidden" open>
            <summary className="flex h-target cursor-pointer list-none items-center justify-between border-y border-rule font-mono text-label uppercase text-ink-muted outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:text-label-lg">
              Navigation
              <ClipboardListIcon aria-hidden="true" className="size-4" />
            </summary>
            <div className="mt-3">
              <WorkNavigation role={role} activeSection={activeSection} />
            </div>
          </details>
          <div className="hidden md:block">
            <WorkNavigation role={role} activeSection={activeSection} />
          </div>
          {activeOrganization && <NewOrganizationForm />}
          <LogoutButton />
        </aside>
        <div className="min-w-0">
          {activeOrganization ? (
            children ?? (
              <WorkspaceOverview
                account={account}
                activeOrganization={activeOrganization}
              />
            )
          ) : (
            <CreateOrganizationForm />
          )}
        </div>
      </div>
    </div>
  );
}

function formatIsoDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}
