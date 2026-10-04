import React from "react";

import { Brand } from "@/components/layout/Brand";
import { Card, CardBody } from "@/components/ui/Card";

export interface AuthShellProps {
  /** The one `h1` of the page. The auth tests and the axe scan both look it up by name. */
  title: string;
  /** One supporting line under the title, when the page needs to explain itself. */
  description?: string;
  /** The card: a form, a status, or an error. */
  children: React.ReactNode;
  /** The line under the card — the way out of this page into another one. */
  footer?: React.ReactNode;
  /** Applied to the centred column, for the rare page that needs to widen it. */
  className?: string;
}

/**
 * The frame every page of the authentication flow shares.
 *
 * WHY IT IS ONE COMPONENT. The four auth pages were four hand-written copies of
 * the same centred column, and they had already drifted: the login page linked
 * its wordmark to `/`, the register page drew the wordmark with a Latin `H`
 * instead of the Arabic mark, and the two password flows invented their own
 * green confirmation box. Four copies of a layout is four opportunities to
 * disagree about what the product looks like on the first screen a reader ever
 * sees, which is the one screen that decides whether they take the product
 * seriously.
 *
 * WHY THE WORDMARK IS NOT A LINK HERE. Every page that requires a session
 * redirects a reader without one back to `/login`, so a wordmark pointing at `/`
 * inside that flow is a link that navigates nowhere and bounces twice before it
 * settles. `Brand` is therefore rendered without an `href`: the wordmark
 * identifies the product, and the footer line is the actual way out of the page.
 *
 * The card, not the column, is the surface: one `bg-surface` box on the canvas,
 * `shadow-card` because it is the only raised element on the screen, and
 * `animate-rise` for the 300ms page entrance of §13.
 */
export function AuthShell({ title, description, children, footer, className = "" }: AuthShellProps) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10 sm:px-6">
      <div className={`w-full max-w-md animate-rise ${className}`.trim()}>
        <div className="mb-6 flex justify-center">
          <Brand size="lg" />
        </div>

        <div className="mb-6 text-center">
          <h1 className="font-arabic-heading text-2xl font-bold text-ink sm:text-3xl">{title}</h1>
          {description && <p className="mt-2 text-sm text-ink-muted">{description}</p>}
        </div>

        <Card className="shadow-card">
          <CardBody>{children}</CardBody>
        </Card>

        {footer && <p className="mt-6 text-center text-sm text-ink-muted">{footer}</p>}
      </div>
    </div>
  );
}