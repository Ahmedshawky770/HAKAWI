"use client";

import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { PageHeader } from "@/components/ui/Card";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Loading } from "@/components/ui/Loading";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Input";
import { useStrings } from "@/components/providers/LocaleProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { useAdminRoleAssignments, isFailedLoad, useInvalidation } from "@/lib/queries";
import { classifyError } from "@/lib/errors";
import { api } from "@/lib/api";
import type { RoleAssignmentShape } from "@/lib/schemas";

/**
 * The role-management desk.
 *
 * WHO MAY ENTER. `super_admin` only. A content_moderator, financial_officer or
 * verification_officer who opens this URL is stopped by the guard before the
 * page renders.
 *
 * WHAT IT SHOWS. Three tabs:
 * - Assignments: the current admin role assignments, each with the user id,
 *   role, reason, expiry, assigned-by and assigned-at. Every row carries a
 *   revoke button (MFA-protected on the backend).
 * - Stats: assignment counts — total, active, expired — plus break-glass uses.
 * - Break glass: emergency temporary elevation to a higher role, with MFA, a
 *   maximum of 60 minutes and a required reason.
 *
 * ASSIGN FORM. User id, role (select from the four admin roles), reason and
 * optional expiry date. Submits to `POST /admin/roles/break-glass`. Success
 * invalidates the assignments cache so the list refreshes.
 *
 * THE GUARD IS UX, NOT SECURITY. The backend's
 * `@Secured(AccountType.ADMIN)` and `@RequireAdminRole(AdminRole.SUPER_ADMIN)`
 * refuse every request a role does not own, and `@RequireMfa()` guards writes
 * and break-glass activation.
 */
export default function RolesAdminPage() {
  const strings = useStrings();
  const { notify } = useToast();
  const invalidate = useInvalidation();
  const [activeTab, setActiveTab] = useState<"assignments" | "stats" | "break-glass">("assignments");

  const [userId, setUserId] = useState("");
  const [adminRole, setAdminRole] = useState("content_moderator");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const assignmentsQuery = useAdminRoleAssignments();

  const breakGlassMutation = useMutation({
    mutationFn: () =>
      api.postAdminBreakGlass({
        adminRole,
        durationMinutes: 60,
        reason,
      }),
    onSuccess: async () => {
      await invalidate.admin();
      notify(strings.admin.roles.breakGlassButton, "success");
      setAdminRole("content_moderator");
      setReason("");
    },
    onError: (err: Error) => {
      notify(classifyError(err), "error");
    },
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      api.postAdminAssignRole({
        userId,
        adminRole,
        reason,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      }),
    onSuccess: async () => {
      await invalidate.admin();
      notify(strings.admin.roles.assignButton, "success");
      setUserId("");
      setAdminRole("content_moderator");
      setReason("");
      setExpiresAt("");
    },
    onError: (err: Error) => {
      notify(classifyError(err), "error");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (data: { userId: string; adminRole: string; revokeReason: string }) =>
      api.deleteAdminRevokeRole(data),
    onSuccess: async () => {
      await invalidate.admin();
      notify(strings.admin.roles.revokeButton, "success");
    },
    onError: (err: Error) => {
      notify(classifyError(err), "error");
    },
  });

  if (assignmentsQuery.isLoading) {
    return (
      <div className="animate-rise">
        <PageHeader title={strings.admin.roles.pageTitle} description={strings.admin.roles.pageDescription} />
        <Loading />
      </div>
    );
  }

  if (isFailedLoad(assignmentsQuery)) {
    return (
      <div className="animate-rise">
        <PageHeader title={strings.admin.roles.pageTitle} description={strings.admin.roles.pageDescription} />
        <ErrorMessage
          title={strings.admin.common.loadFailed}
          error={strings.admin.common.refresh}
          onRetry={() => {
            void assignmentsQuery.refetch();
            void invalidate.admin();
          }}
        />
      </div>
    );
  }

  const assignments: RoleAssignmentShape[] = assignmentsQuery.data?.assignments ?? [];
  const total = assignmentsQuery.data?.total ?? 0;

  const tabButton = (tab: "assignments" | "stats" | "break-glass", label: string) => (
    <button
      type="button"
      onClick={() => setActiveTab(tab)}
      aria-current={activeTab === tab ? "true" : undefined}
      className={`min-h-11 px-4 py-2 text-sm font-medium ${
        activeTab === tab ? "border-b-2 border-accent text-accent-ink" : "text-ink-muted"
      }`}
    >
      {label}
    </button>
  );

  const roleBadge = (role: string) => {
    const label = strings.admin.roles.roleLabels[role] ?? role;
    return <Badge tone="accent" state={role}>{label}</Badge>;
  };

  const roleOptions = [
    { value: "super_admin", label: strings.admin.roles.roleLabels.super_admin },
    { value: "content_moderator", label: strings.admin.roles.roleLabels.content_moderator },
    { value: "financial_officer", label: strings.admin.roles.roleLabels.financial_officer },
    { value: "verification_officer", label: strings.admin.roles.roleLabels.verification_officer },
  ];

  return (
    <AdminGuard allowedRoles={["super_admin"]}>
      <div className="animate-rise space-y-6">
        <PageHeader
          title={strings.admin.roles.pageTitle}
          description={strings.admin.roles.pageDescription}
        />

        {/* Stats row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={strings.admin.roles.statsTotalAssignments}
            value={total}
            icon="users"
            hint={strings.admin.roles.statsActiveAssignments}
          />
          <StatCard
            label={strings.admin.roles.statsActiveAssignments}
            value={assignments.filter((a: RoleAssignmentShape) => !a.revokedAt).length}
            icon="check"
            hint=""
          />
          <StatCard
            label={strings.admin.roles.statsExpiredAssignments}
            value={assignments.filter(
              (a: RoleAssignmentShape) => a.expiresAt && new Date(a.expiresAt) < new Date()
            ).length}
            icon="close"
            hint=""
          />
          <StatCard
            label={strings.admin.roles.statsBreakGlassUses}
            value={0}
            icon="warning"
            hint=""
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-line">
          {tabButton("assignments", strings.admin.roles.tabAssignments)}
          {tabButton("stats", strings.admin.roles.tabStats)}
          {tabButton("break-glass", strings.admin.roles.tabBreakGlass)}
        </div>

        {/* Assignments tab */}
        {activeTab === "assignments" && (
          <div className="space-y-4">
            <Card className="p-5">
              <CardBody>
                <h3 className="text-lg font-bold text-ink mb-4">{strings.admin.roles.assignButton}</h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    assignMutation.mutate();
                  }}
                  className="space-y-4"
                >
                  <Input
                    type="text"
                    required
                    label={strings.admin.roles.assignUserId("—")}
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                  />
                  <Select
                    label={strings.admin.roles.assignRole("—")}
                    value={adminRole}
                    onChange={(e) => setAdminRole(e.target.value)}
                    options={roleOptions}
                  />
                   <Input
                     type="text"
                     required
                     label={strings.admin.roles.assignReason("—")}
                     value={reason}
                     onChange={(e) => setReason(e.target.value)}
                   />
                  <Input
                    type="date"
                    label={strings.admin.roles.assignExpiresAt("—")}
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                  />
                  <Button type="submit" loading={assignMutation.isPending} variant="primary">
                    {strings.admin.roles.assignButton}
                  </Button>
                </form>
              </CardBody>
            </Card>
            {assignments.length === 0 ? (
              <p className="text-sm text-ink-muted">{strings.admin.roles.assignmentsEmpty}</p>
            ) : (
              <ul className="space-y-3">
                {assignments.map((assignment: RoleAssignmentShape) => (
                  <li key={assignment.id} className="rounded-lg border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-ink">
                          {strings.admin.roles.assignUserId(assignment.userId)}
                        </p>
                        <p className="text-sm text-ink-muted">{roleBadge(assignment.adminRole)}</p>
                        {assignment.reason && (
                          <p className="text-sm text-ink-muted">
                            {strings.admin.roles.assignReason(assignment.reason)}
                          </p>
                        )}
                        {assignment.expiresAt && (
                          <p className="text-sm text-ink-muted">
                            {strings.admin.roles.assignExpiresAt(assignment.expiresAt)}
                          </p>
                        )}
                        <p className="text-sm text-ink-muted">
                          {strings.admin.roles.assignAssignedBy(assignment.assignedBy ?? "—")}
                        </p>
                        <p className="text-sm text-ink-muted">
                          {strings.admin.roles.assignAssignedAt(assignment.assignedAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="danger"
                          loading={revokeMutation.isPending}
                          disabled={revokeMutation.isPending}
                           onClick={() => {
                             const revokeReason = window.prompt(strings.admin.roles.assignReason("—"));
                             if (!revokeReason || revokeReason.trim().length === 0) return;
                             if (window.confirm(strings.admin.roles.revokeConfirm)) {
                               revokeMutation.mutate({
                                 userId: assignment.userId,
                                 adminRole: assignment.adminRole,
                                 revokeReason: revokeReason.trim(),
                               });
                             }
                           }}
                        >
                          {strings.admin.roles.revokeButton}
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Stats tab content already rendered above as stat cards */}
        {activeTab === "stats" && (
          <div className="rounded-xl border border-line bg-surface p-6">
            <p className="text-sm text-ink-muted">{strings.admin.hub.noSurfaces}</p>
          </div>
        )}

        {/* Break glass tab */}
        {activeTab === "break-glass" && (
          <div className="space-y-4">
            <Card className="p-5">
              <CardBody>
                <h3 className="text-lg font-bold text-ink mb-4">{strings.admin.roles.breakGlassTitle}</h3>
                <p className="text-sm text-ink-muted mb-6">{strings.admin.roles.breakGlassDescription}</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    breakGlassMutation.mutate();
                  }}
                  className="space-y-4"
                >
                  <Select
                    label={strings.admin.roles.breakGlassRole("—")}
                    hint="super_admin, content_moderator, financial_officer, verification_officer"
                    value={adminRole}
                    onChange={(e) => setAdminRole(e.target.value)}
                    options={roleOptions}
                  />
                  <Input
                    type="number"
                    min="1"
                    max="60"
                    label={strings.admin.roles.breakGlassDuration(60)}
                    hint={strings.admin.roles.breakGlassMaxMinutes}
                    value="60"
                    readOnly
                  />
                   <Input
                     type="text"
                     required
                     minLength={10}
                     label={strings.admin.roles.breakGlassReason("—")}
                     value={reason}
                     onChange={(e) => setReason(e.target.value)}
                     placeholder="Emergency reason"
                   />
                  <Button type="submit" loading={breakGlassMutation.isPending} variant="primary">
                    {strings.admin.roles.breakGlassButton}
                  </Button>
                </form>
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
