"use client";

import React from "react";

import { AdminGuard } from "@/components/admin/AdminGuard";
import { PageHeader } from "@/components/ui/Card";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon } from "@/components/ui/Icon";
import { StatCard } from "@/components/ui/StatCard";
import { useStrings } from "@/components/providers/LocaleProvider";
import { useStoredUser } from "@/lib/use-stored-user";
import { useAdminModerationStats, useAdminRoleAssignments, useAdminPaymentStats, useAdminPublisherStats, isFailedLoad, useInvalidation } from "@/lib/queries";
import { useToast } from "@/components/providers/ToastProvider";

/**
 * The admin hub — the landing screen every admin sees first.
 *
 * WHO MAY ENTER. `super_admin` only. Every other role is sent to their own
 * surface by the guard, because the hub shows cross-surface statistics and
 * links to every desk, and a content_moderator who can see financial totals
 * is an information leak.
 *
 * WHAT IT SHOWS. One stat card per surface the caller's role owns, plus the
 * role label. Each stat card is a link to that surface. super_admin sees all
 * five cards; a role that owns only one surface sees one card.
 *
 * THE DATA IS SHARED. The stats come from the same query cache every admin
 * surface reads, so the hub and the desks agree on the numbers without each
 * page refetching.
 */
export default function AdminHubPage() {
  const strings = useStrings();
  const { notify } = useToast();
  const invalidate = useInvalidation();

  const user = useStoredUser();
  const isSuperAdmin = user?.accountType === "admin" && user?.adminRole === "super_admin";

  const moderationStats = useAdminModerationStats(isSuperAdmin);
  const roleAssignments = useAdminRoleAssignments(isSuperAdmin);
  const paymentStats = useAdminPaymentStats(isSuperAdmin);
  const publisherStats = useAdminPublisherStats(isSuperAdmin);

  const failed =
    isFailedLoad(moderationStats) ||
    isFailedLoad(roleAssignments) ||
    isFailedLoad(paymentStats) ||
    isFailedLoad(publisherStats);

  if (failed) {
    return (
      <div className="animate-rise">
        <PageHeader title={strings.admin.hub.pageTitle} description={strings.admin.hub.pageDescription} />
        <ErrorMessage
          title={strings.admin.common.loadFailed}
          error={strings.admin.common.refresh}
          onRetry={() => {
            void moderationStats.refetch();
            void roleAssignments.refetch();
            void paymentStats.refetch();
            void publisherStats.refetch();
            void invalidate.admin();
          }}
        />
      </div>
    );
  }

  const m = moderationStats.data;
  const r = roleAssignments.data;
  const p = paymentStats.data;
  const v = publisherStats.data;

  const cards = [
    {
      key: "moderation",
      label: strings.admin.hub.moderationCardTitle,
      description: strings.admin.hub.moderationCardDescription,
      icon: "comment",
      href: "/admin/moderation",
      value: m?.totalReports ?? 0,
      hint: strings.admin.hub.statsReports,
    },
    {
      key: "financial",
      label: strings.admin.hub.financialCardTitle,
      description: strings.admin.hub.financialCardDescription,
      icon: "wallet",
      href: "/admin/financial",
      value: p?.total ?? 0,
      hint: strings.admin.hub.statsPayments,
    },
    {
      key: "verification",
      label: strings.admin.hub.verificationCardTitle,
      description: strings.admin.hub.verificationCardDescription,
      icon: "user",
      href: "/admin/verification",
      value: v ? v.pendingApplications + v.approvedApplications + v.rejectedApplications : 0,
      hint: strings.admin.hub.statsVerifications,
    },
    {
      key: "roles",
      label: strings.admin.hub.rolesCardTitle,
      description: strings.admin.hub.rolesCardDescription,
      icon: "users",
      href: "/admin/roles",
      value: r?.total ?? 0,
      hint: strings.admin.hub.statsRoleAssignments,
    },
  ];

  return (
    <AdminGuard allowedRoles={["super_admin"]}>
      <div className="animate-rise space-y-6">
        <PageHeader
          title={strings.admin.hub.pageTitle}
          description={strings.admin.hub.pageDescription}
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <Card key={card.key} className="interactive cursor-pointer" as="section">
              <CardBody className="p-5">
                <StatCard
                  label={card.label}
                  value={card.value}
                  icon={card.icon as any}
                  hint={card.hint}
                />
              </CardBody>
            </Card>
          ))}
        </div>

        <div className="rounded-xl border border-line bg-surface p-6">
          <h2 className="text-xl font-bold text-ink mb-4">{strings.admin.hub.availableSurfaces}</h2>
          <ul className="space-y-3">
            {cards.map((card) => (
              <li key={card.key}>
                <a
                  href={card.href}
                  className="flex items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium text-ink transition-colors duration-200 hover:bg-surface-raised hover:text-accent border border-transparent hover:border-line-strong block"
                >
                  <span>{card.label}</span>
                  <Icon name="chevron" size="sm" className="text-ink-muted" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AdminGuard>
  );
}
