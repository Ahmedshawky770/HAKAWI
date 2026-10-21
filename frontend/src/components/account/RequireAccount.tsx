"use client";

import React from "react";

import { can } from "@/lib/account";
import { useStoredUser } from "@/lib/use-stored-user";
import { useStrings } from "@/components/providers/LocaleProvider";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

type RequireAccountProps = {
  capability: import("@/lib/account").AccountCapability;
  children: React.ReactNode;
  upgradeRoute?: string;
};

/**
 * The gate on a capability the reader's role does not carry.
 *
 * The copy used to be two Arabic literals written into this component, inside
 * an interface the reader may have switched to English — so an English reader
 * met "لا يمكنك الوصول إلى هذه الصفحة" in the middle of an English product. The
 * words now come from the dictionary, and so does the NAME of the capability:
 * `capabilityLabel` was an Arabic-only table in `lib/account.ts`, and it is now
 * `strings.account.capabilityLabels`, the same key set in both languages.
 *
 * THE ACCOUNT TYPE IS READ FROM THE STORE AND NOT FROM LOCAL STORAGE DURING
 * RENDER. `getStoredUser()` was called in the body of this component, which is
 * a read of a browser fact on a machine that has no browser: the server
 * rendered the "restricted" card for a reader who IS allowed, and the client
 * rendered the page they came for. `useStoredUser` reads the same value
 * through `useSyncExternalStore`, so the server is given `null` and the client
 * is given the reader.
 */
export function RequireAccount({
  capability,
  children,
  upgradeRoute,
}: RequireAccountProps) {
  const strings = useStrings();
  const stored = useStoredUser();
  const allowed = can(stored?.accountType ?? null, capability);

  if (allowed) {
    return <>{children}</>;
  }

  const label = strings.account.capabilityLabels[capability];
  return (
    <Card>
      <CardBody>
        <p className="text-ink">{strings.account.restrictedTitle}</p>
        <p className="text-ink-muted text-sm">{strings.account.restrictedBody(label)}</p>
        {upgradeRoute && (
          <ButtonLink href={upgradeRoute} className="mt-4 inline-block">
            {strings.account.upgradeLink}
          </ButtonLink>
        )}
      </CardBody>
    </Card>
  );
}
