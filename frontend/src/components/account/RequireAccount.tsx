"use client";

import React from "react";

import { getStoredUser } from "@/lib/api";
import { can, capabilityLabel } from "@/lib/account";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

type RequireAccountProps = {
  capability: import("@/lib/account").AccountCapability;
  children: React.ReactNode;
  upgradeRoute?: string;
};

export function RequireAccount({
  capability,
  children,
  upgradeRoute,
}: RequireAccountProps) {
  const stored = getStoredUser();
  const allowed = can(stored?.accountType ?? null, capability);

  if (allowed) {
    return <>{children}</>;
  }

  const label = capabilityLabel(capability);
  return (
    <Card>
      <CardBody>
        <p className="text-ink">لا يمكنك الوصول إلى هذه الصفحة</p>
        <p className="text-ink-muted text-sm">
          يتطلب هذا الإجراء دوراً أعلى: {label}.
        </p>
        {upgradeRoute && (
          <ButtonLink href={upgradeRoute} className="mt-4 inline-block">
            الانتقال إلى الترقية
          </ButtonLink>
        )}
      </CardBody>
    </Card>
  );
}
