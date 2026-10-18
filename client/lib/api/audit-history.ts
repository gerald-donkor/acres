import type { AuditAction, OrganizationAuditEvent } from "@acres/shared";

export type AuditEventConnection = {
  edges: Array<{ node: OrganizationAuditEvent }>;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

export const AUDIT_HISTORY_OPERATION = "OrganizationAuditHistory";

export const AUDIT_HISTORY_QUERY = /* GraphQL */ `
  query OrganizationAuditHistory($after: String) {
    organizationAuditEvents(after: $after) {
      edges {
        node {
          id
          action
          targetType
          targetId
          actorAccountId
          createdAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const actionLabels: Record<AuditAction, string> = {
  organization_created: "Organization created",
  organization_updated: "Organization updated",
  invitation_issued: "Invitation issued",
  invitation_revoked: "Invitation revoked",
  invitation_accepted: "Invitation accepted",
  membership_role_changed: "Member role changed",
  membership_revoked: "Member access revoked",
  ownership_transferred: "Ownership transferred",
  report_published: "Report published",
  export_requested: "Export requested",
};

export function auditActionLabel(action: string): string {
  return Object.hasOwn(actionLabels, action)
    ? actionLabels[action as AuditAction]
    : action.replaceAll("_", " ");
}

export type AuditPageParams = {
  after?: string | string[];
  organization?: string | string[];
};

// UI input bound, not a change to the backend cursor contract.
export const AUDIT_CURSOR_MAX_LENGTH = 2048;

export function auditPageCursor(
  params: AuditPageParams,
  organizationId: string,
): { valid: true; after?: string } | { valid: false } {
  const { after, organization } = params;
  if (after === undefined && organization === undefined) return { valid: true };
  if (
    typeof after !== "string" ||
    after.length === 0 ||
    after.length > AUDIT_CURSOR_MAX_LENGTH ||
    typeof organization !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      organization,
    )
  ) {
    return { valid: false };
  }
  // A bookmark can refer to a different tenant than the selected cookie.
  // Never send that prior tenant's cursor to the active tenant's query.
  return organization === organizationId
    ? { valid: true, after }
    : { valid: true };
}

export function auditPageHref(organizationId: string, after: string): string {
  return `/app/audit?${new URLSearchParams({ organization: organizationId, after })}`;
}
