"use client";

import { useState } from "react";
import type {
  AccountProfile,
  OrganizationInvitation,
  OrganizationMember,
  OrganizationRole,
  OrganizationSummary,
} from "@acres/shared";
import { ShieldCheckIcon, UserPlusIcon, UsersIcon } from "lucide-react";

import {
  changeMemberRole,
  inviteMember,
  revokeInvitation,
  revokeMember,
} from "@/lib/api/browser";
import { getApiErrorCopy } from "@/lib/api/envelope";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const roleLabel: Record<OrganizationRole, string> = {
  owner: "Owner",
  admin: "Admin",
  analyst: "Analyst",
  viewer: "Viewer",
};

function formatIsoDate(isoString: string): string {
  const date = new Date(isoString);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export function MembersWorkspace({
  organization,
  currentAccount,
  initialMembers,
  initialInvitations,
}: {
  organization: OrganizationSummary;
  currentAccount: AccountProfile;
  initialMembers: OrganizationMember[];
  initialInvitations: OrganizationInvitation[];
}) {
  const actorRole = organization.membership.role;
  const isOwner = actorRole === "owner";

  const [members, setMembers] = useState<OrganizationMember[]>(initialMembers);
  const [invitations, setInvitations] =
    useState<OrganizationInvitation[]>(initialInvitations);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Exclude<OrganizationRole, "owner">>(
    "viewer",
  );
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // Row mutation states
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);
  const [pendingInvId, setPendingInvId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const activeMembers = members.filter((m) => m.revokedAt === null);
  const pendingInvitations = invitations.filter(
    (i) => i.acceptedAt === null && i.revokedAt === null,
  );

  async function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setIsInviting(true);
    setInviteError(null);
    setInviteSuccess(null);
    setActionError(null);
    setActionSuccess(null);

    try {
      const issued = await inviteMember(organization.id, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setInvitations((prev) => [issued, ...prev]);
      setInviteSuccess(`Invitation issued and email dispatched to ${issued.email}.`);
      setInviteEmail("");
      setInviteRole("viewer");
    } catch (error) {
      const copy = getApiErrorCopy(error);
      setInviteError(copy.message || "Failed to issue invitation.");
    } finally {
      setIsInviting(false);
    }
  }

  async function handleRoleChange(
    membershipId: string,
    newRole: Exclude<OrganizationRole, "owner">,
  ) {
    setPendingMemberId(membershipId);
    setActionError(null);
    setActionSuccess(null);

    try {
      const updated = await changeMemberRole(organization.id, membershipId, newRole);
      setMembers((prev) =>
        prev.map((m) => (m.id === membershipId ? updated : m)),
      );
      setActionSuccess(`Role updated to ${roleLabel[newRole]} for ${updated.email}.`);
    } catch (error) {
      const copy = getApiErrorCopy(error);
      setActionError(copy.message || "Failed to update member role.");
    } finally {
      setPendingMemberId(null);
    }
  }

  async function handleRevokeMember(membershipId: string, email: string) {
    setPendingMemberId(membershipId);
    setActionError(null);
    setActionSuccess(null);

    try {
      await revokeMember(organization.id, membershipId);
      setMembers((prev) =>
        prev.map((m) =>
          m.id === membershipId
            ? { ...m, revokedAt: new Date().toISOString() }
            : m,
        ),
      );
      setActionSuccess(`Membership access revoked for ${email}.`);
    } catch (error) {
      const copy = getApiErrorCopy(error);
      setActionError(copy.message || "Failed to revoke member.");
    } finally {
      setPendingMemberId(null);
    }
  }

  async function handleRevokeInvitation(invitationId: string, email: string) {
    setPendingInvId(invitationId);
    setActionError(null);
    setActionSuccess(null);

    try {
      await revokeInvitation(organization.id, invitationId);
      setInvitations((prev) =>
        prev.map((i) =>
          i.id === invitationId
            ? { ...i, revokedAt: new Date().toISOString() }
            : i,
        ),
      );
      setActionSuccess(`Pending invitation revoked for ${email}.`);
    } catch (error) {
      const copy = getApiErrorCopy(error);
      setActionError(copy.message || "Failed to revoke invitation.");
    } finally {
      setPendingInvId(null);
    }
  }

  return (
    <section
      aria-labelledby="members-workspace-title"
      className="grid w-full min-w-0 max-w-full grid-cols-1 gap-8"
    >
      {/* Workspace Header */}
      <div className="w-full min-w-0 border-b border-rule pb-5">
        <p className="font-mono text-label uppercase text-brand lg:text-label-lg">
          Organization
        </p>
        <h1
          id="members-workspace-title"
          className="mt-2 font-serif text-title text-ink"
        >
          Members and access.
        </h1>
        <p className="mt-3 max-w-2xl text-body text-ink-muted">
          Manage team members, update role permissions, and issue or revoke
          invitations for {organization.name}.
        </p>
      </div>

      {/* Global Status Alerts */}
      <div aria-live="polite" aria-atomic="true" className="w-full min-w-0">
        {actionError && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Action Failed</AlertTitle>
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        )}
        {actionSuccess && (
          <Alert className="mb-4 border-brand/40 bg-secondary/20">
            <AlertTitle className="text-brand font-medium">Success</AlertTitle>
            <AlertDescription className="text-ink">{actionSuccess}</AlertDescription>
          </Alert>
        )}
      </div>

      {/* Invite Member Section */}
      <div className="w-full min-w-0 rounded-[14px] border border-rule bg-card p-4 sm:p-6 shadow-xs">
        <div className="flex items-center gap-2 border-b border-rule pb-4">
          <UserPlusIcon className="size-5 text-brand" aria-hidden="true" />
          <h2 id="invite-form-heading" className="font-serif text-xl font-medium text-ink">
            Invite a team member
          </h2>
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          Invitations send an email with an accept link valid for 24 hours.
        </p>

        <form
          aria-labelledby="invite-form-heading"
          onSubmit={handleInviteSubmit}
          className="mt-5 grid w-full min-w-0 grid-cols-1 gap-4 lg:grid-cols-[1fr_12rem_auto] lg:items-end"
        >
          <div className="grid w-full min-w-0 grid-cols-1 gap-1.5">
            <label
              htmlFor="invite-member-email"
              className="font-mono text-label uppercase text-ink lg:text-label-lg"
            >
              Email Address
            </label>
            <Input
              id="invite-member-email"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@example.com"
              required
              disabled={isInviting}
              className="h-11 min-h-target text-sm"
            />
          </div>

          <div className="grid w-full min-w-0 grid-cols-1 gap-1.5">
            <label
              htmlFor="invite-member-role"
              className="font-mono text-label uppercase text-ink lg:text-label-lg"
            >
              Assigned Role
            </label>
            <NativeSelect
              id="invite-member-role"
              value={inviteRole}
              onChange={(e) =>
                setInviteRole(e.target.value as Exclude<OrganizationRole, "owner">)
              }
              disabled={isInviting}
              size="target"
              className="w-full"
            >
              <NativeSelectOption value="viewer">Viewer</NativeSelectOption>
              <NativeSelectOption value="analyst">Analyst</NativeSelectOption>
              {isOwner && (
                <NativeSelectOption value="admin">Admin</NativeSelectOption>
              )}
            </NativeSelect>
          </div>

          <div className="pt-2 lg:pt-0">
            <Button
              type="submit"
              disabled={isInviting || !inviteEmail.trim()}
              className="h-11 min-h-[44px] w-full rounded-full px-6 bg-brand text-white hover:bg-brand-hover lg:w-auto"
            >
              {isInviting ? (
                <span className="flex items-center gap-2">
                  <Spinner className="size-4" />
                  <span>Inviting...</span>
                </span>
              ) : (
                "Send Invitation"
              )}
            </Button>
          </div>
        </form>

        <div aria-live="polite" aria-atomic="true" className="mt-4">
          {inviteError && (
            <Alert variant="destructive">
              <AlertTitle>Invitation Failed</AlertTitle>
              <AlertDescription>{inviteError}</AlertDescription>
            </Alert>
          )}
          {inviteSuccess && (
            <Alert className="border-brand/40 bg-secondary/20">
              <AlertTitle className="text-brand font-medium">Invitation Sent</AlertTitle>
              <AlertDescription className="text-ink">{inviteSuccess}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      {/* Active Members Section */}
      <section
        aria-labelledby="active-members-heading"
        className="grid w-full min-w-0 grid-cols-1 gap-4"
      >
        <div className="flex items-center justify-between border-b border-rule pb-3">
          <div className="flex items-center gap-2">
            <UsersIcon className="size-5 text-ink-muted" aria-hidden="true" />
            <h2
              id="active-members-heading"
              className="font-serif text-xl font-medium text-ink"
            >
              Active Members
            </h2>
          </div>
          <Badge variant="secondary" className="font-mono">
            {activeMembers.length} {activeMembers.length === 1 ? "member" : "members"}
          </Badge>
        </div>

        {/* Desktop / Tablet Table */}
        <div className="hidden w-full min-w-0 overflow-hidden rounded-[14px] border border-rule md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeMembers.map((member) => {
                const isSelf = member.accountId === currentAccount.id;
                const isMemberOwner = member.role === "owner";
                const canManageRole =
                  !isSelf &&
                  !isMemberOwner &&
                  (isOwner || (actorRole === "admin" && member.role !== "admin"));
                const canRevoke =
                  !isSelf &&
                  !isMemberOwner &&
                  (isOwner || actorRole === "admin");
                const isPending = pendingMemberId === member.id;

                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          {member.displayName && (
                            <p className="font-medium text-ink">
                              {member.displayName}
                            </p>
                          )}
                          <p className="font-mono text-sm text-ink-muted">
                            {member.email}
                          </p>
                        </div>
                        {isSelf && (
                          <Badge variant="outline" className="font-mono text-xs">
                            You
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      {canManageRole ? (
                        <div className="w-36">
                          <label
                            htmlFor={`role-select-${member.id}`}
                            className="sr-only"
                          >
                            Change role for {member.email}
                          </label>
                          <NativeSelect
                            id={`role-select-${member.id}`}
                            value={member.role}
                            disabled={isPending}
                            onChange={(e) =>
                              handleRoleChange(
                                member.id,
                                e.target.value as Exclude<OrganizationRole, "owner">,
                              )
                            }
                            size="target"
                            className="w-36"
                          >
                            <NativeSelectOption value="viewer">
                              Viewer
                            </NativeSelectOption>
                            <NativeSelectOption value="analyst">
                              Analyst
                            </NativeSelectOption>
                            {isOwner && (
                              <NativeSelectOption value="admin">
                                Admin
                              </NativeSelectOption>
                            )}
                          </NativeSelect>
                        </div>
                      ) : (
                        <Badge
                          variant={isMemberOwner ? "default" : "secondary"}
                          className="capitalize"
                        >
                          {roleLabel[member.role]}
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell className="font-mono text-sm text-ink-muted">
                      {formatIsoDate(member.createdAt)}
                    </TableCell>

                    <TableCell className="text-right">
                      {canRevoke ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleRevokeMember(member.id, member.email)}
                          aria-label={`Revoke access for ${member.email}`}
                          className="min-h-target min-w-target text-xs"
                        >
                          {isPending ? <Spinner className="size-3.5" /> : "Revoke"}
                        </Button>
                      ) : (
                        <span className="font-mono text-xs text-ink-muted">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Stacked Cards */}
        <div className="grid w-full min-w-0 grid-cols-1 gap-3 md:hidden">
          {activeMembers.map((member) => {
            const isSelf = member.accountId === currentAccount.id;
            const isMemberOwner = member.role === "owner";
            const canManageRole =
              !isSelf &&
              !isMemberOwner &&
              (isOwner || (actorRole === "admin" && member.role !== "admin"));
            const canRevoke =
              !isSelf &&
              !isMemberOwner &&
              (isOwner || actorRole === "admin");
            const isPending = pendingMemberId === member.id;

            return (
              <div
                key={member.id}
                className="w-full min-w-0 rounded-[14px] border border-rule bg-card p-4 space-y-3"
              >
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {member.displayName && (
                      <p className="truncate font-medium text-ink">
                        {member.displayName}
                      </p>
                    )}
                    <p className="truncate font-mono text-sm text-ink-muted">
                      {member.email}
                    </p>
                  </div>
                  {isSelf ? (
                    <Badge variant="outline" className="font-mono text-xs shrink-0">
                      You
                    </Badge>
                  ) : (
                    <Badge
                      variant={isMemberOwner ? "default" : "secondary"}
                      className="capitalize shrink-0"
                    >
                      {roleLabel[member.role]}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs font-mono text-ink-muted border-t border-rule pt-2">
                  <span>Joined</span>
                  <span>{formatIsoDate(member.createdAt)}</span>
                </div>

                {(canManageRole || canRevoke) && (
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-rule">
                    {canManageRole && (
                      <div className="flex-1 min-w-[130px]">
                        <label
                          htmlFor={`mobile-role-${member.id}`}
                          className="sr-only"
                        >
                          Change role for {member.email}
                        </label>
                        <NativeSelect
                          id={`mobile-role-${member.id}`}
                          value={member.role}
                          disabled={isPending}
                          onChange={(e) =>
                            handleRoleChange(
                              member.id,
                              e.target.value as Exclude<OrganizationRole, "owner">,
                            )
                          }
                          size="target"
                          className="w-full"
                        >
                          <NativeSelectOption value="viewer">
                            Viewer
                          </NativeSelectOption>
                          <NativeSelectOption value="analyst">
                            Analyst
                          </NativeSelectOption>
                          {isOwner && (
                            <NativeSelectOption value="admin">
                              Admin
                            </NativeSelectOption>
                          )}
                        </NativeSelect>
                      </div>
                    )}
                    {canRevoke && (
                      <Button
                        variant="destructive"
                        disabled={isPending}
                        onClick={() => handleRevokeMember(member.id, member.email)}
                        aria-label={`Revoke access for ${member.email}`}
                        className="min-h-target h-11 px-4 text-sm"
                      >
                        {isPending ? <Spinner className="size-4" /> : "Revoke"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Pending Invitations Section */}
      <section
        aria-labelledby="pending-invitations-heading"
        className="grid w-full min-w-0 grid-cols-1 gap-4"
      >
        <div className="flex items-center justify-between border-b border-rule pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="size-5 text-ink-muted" aria-hidden="true" />
            <h2
              id="pending-invitations-heading"
              className="font-serif text-xl font-medium text-ink"
            >
              Pending Invitations
            </h2>
          </div>
          <Badge variant="outline" className="font-mono">
            {pendingInvitations.length} pending
          </Badge>
        </div>

        {pendingInvitations.length === 0 ? (
          <div className="w-full min-w-0 rounded-[14px] border border-dashed border-rule p-8 text-center">
            <p className="text-body text-ink-muted">
              No pending invitations for this organization.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop / Tablet Invitations Table */}
            <div className="hidden w-full min-w-0 overflow-hidden rounded-[14px] border border-rule md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invitee Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingInvitations.map((invitation) => {
                    const isPending = pendingInvId === invitation.id;
                    return (
                      <TableRow key={invitation.id}>
                        <TableCell className="font-mono text-sm text-ink">
                          {invitation.email}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">
                            {roleLabel[invitation.role]}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-ink-muted">
                          {formatIsoDate(invitation.expiresAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={isPending}
                            onClick={() =>
                              handleRevokeInvitation(invitation.id, invitation.email)
                            }
                            aria-label={`Revoke invitation for ${invitation.email}`}
                            className="min-h-target min-w-target text-xs"
                          >
                            {isPending ? <Spinner className="size-3.5" /> : "Revoke"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Invitations Cards */}
            <div className="grid w-full min-w-0 grid-cols-1 gap-3 md:hidden">
              {pendingInvitations.map((invitation) => {
                const isPending = pendingInvId === invitation.id;
                return (
                  <div
                    key={invitation.id}
                    className="w-full min-w-0 rounded-[14px] border border-rule bg-card p-4 space-y-3"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate font-mono text-sm text-ink">
                        {invitation.email}
                      </p>
                      <Badge variant="secondary" className="capitalize shrink-0">
                        {roleLabel[invitation.role]}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-xs font-mono text-ink-muted border-t border-rule pt-2">
                      <span>Expires</span>
                      <span>{formatIsoDate(invitation.expiresAt)}</span>
                    </div>

                    <div className="pt-1 border-t border-rule">
                      <Button
                        variant="destructive"
                        disabled={isPending}
                        onClick={() =>
                          handleRevokeInvitation(invitation.id, invitation.email)
                        }
                        aria-label={`Revoke invitation for ${invitation.email}`}
                        className="min-h-target h-11 w-full text-sm"
                      >
                        {isPending ? <Spinner className="size-4" /> : "Revoke Invitation"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </section>
  );
}
