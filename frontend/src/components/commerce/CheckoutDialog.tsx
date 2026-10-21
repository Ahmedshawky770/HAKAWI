"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isGatewayUrl } from "@/lib/paymob";
import type { PaymentMethodChoice } from "@/lib/api";
import { useStrings } from "@/components/providers/LocaleProvider";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/**
 * The checkout panel: choose a way to pay, pay at the gateway, done.
 *
 * WHY THIS REPLACES A FREE-TEXT FIELD. The book page asked the reader to type
 * a "payment method identifier" — `pm_123456` — into a text box before a
 * purchase would start. That identifier is a fact about the GATEWAY: it is the
 * integration's own handle for a stored instrument, and an ordinary reader has
 * never seen one, cannot know one, and was therefore told to invent a string
 * in order to buy a book. The only outcome that produced was a failed
 * checkout. So the reader is now asked the question they can answer — card or
 * wallet — and the client turns that answer into the value the API takes.
 *
 * WHY THE GATEWAY IS AN IFRAME AND NOT A REDIRECT. `checkoutUrl` is Paymob's
 * `/acceptance/iframes/<token>` URL, which is a page FRAME, not a page: a
 * top-level redirect to it shows a bare frame with no way back. `acceptUrl` is
 * the hosted page for a redirect, and it is offered as a link for a reader
 * whose browser refuses the frame. The two are different facts and the code
 * says which is which.
 *
 * THE DIALOG IS A REAL DIALOG. `role="dialog"` with `aria-modal`, a label
 * that names the step, focus moved into it on open, focus restored to the
 * button that opened it, Escape to leave, and Tab kept inside — a reader using
 * a keyboard must not be able to tab into the page behind a modal that is
 * covering it.
 */
/**
 * The instrument the reader picked.
 *
 * The two words come from the API layer's own type, so the vocabulary the
 * dialog offers and the vocabulary the API accepts cannot drift apart: a
 * third instrument would have to be added in one place, and the compiler would
 * say so.
 */
export type CheckoutMethod = PaymentMethodChoice;

export interface CheckoutSession {
  /** Paymob's frame URL — loaded in the iframe. */
  checkoutUrl: string;
  /** Paymob's hosted page — the fallback when the frame is refused. */
  acceptUrl: string;
}

interface CheckoutDialogProps {
  open: boolean;
  /** The heading of the panel. */
  title: string;
  /** The amount that is about to be charged, already formatted. */
  amount: string;
  /** Called with the chosen method when the reader continues. */
  onConfirm: (method: CheckoutMethod) => void;
  /** Called when the reader leaves the panel without paying. */
  onClose: () => void;
  /** The error from the last attempt, if any. */
  error?: string;
  /** True while the payment is being created. */
  pending?: boolean;
  /** The gateway session, once the payment exists. */
  session?: CheckoutSession | null;
}

export function CheckoutDialog({
  open,
  title,
  amount,
  onConfirm,
  onClose,
  error,
  pending = false,
  session = null,
}: CheckoutDialogProps) {
  const strings = useStrings();
  const [method, setMethod] = useState<CheckoutMethod>("card");
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  /*
   * THE GATEWAY URLS ARE CHECKED BEFORE THEY ARE RENDERED.
   *
   * Both URLs come from the API. A URL is an instruction to the browser — a
   * frame's `src` and a link's `href` both send the reader somewhere — and an
   * API response is not a place to take that instruction from without a check.
   * The CSP's `frame-src` governs the FRAME; it does not govern where a link
   * goes, so the link needs its own check. A URL on any host other than the
   * gateway's is not rendered at all.
   */
  const gatewayUrl = useMemo(
    () => (session && isGatewayUrl(session.checkoutUrl) ? session.checkoutUrl : null),
    [session],
  );
  const acceptUrl = useMemo(
    () => (session && isGatewayUrl(session.acceptUrl) ? session.acceptUrl : null),
    [session],
  );

  // The button that opened the panel is remembered so the focus can go back to
  // it when the panel closes: a reader who closes a dialog expects to be where
  // they were, not at the top of the document.
  //
  // THE EFFECT RE-RUNS WHEN THE STEP CHANGES. The panel swaps the radio group
  // for the gateway block the moment a payment exists, and the control that
  // had the focus is removed with it — leaving the focus on the document body,
  // OUTSIDE the dialog, where the Tab handler below cannot bring it back.
  // Moving the focus again when the step changes keeps it inside.
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    /*
     * THE FOCUS LANDS ON THE CHOICE, NOT ON THE CLOSE BUTTON.
     *
     * The panel's first focusable element in DOCUMENT order is the dismiss
     * button, and a selector like `"input[type=radio], iframe, button, a[href]"`
     * returns whichever of those comes first in the document — which is the
     * dismiss button. So the focus landed on "close", and a reader using a
     * keyboard was told, as the first thing the panel said, that the way out
     * was the most important control in it.
     *
     * The control the panel is actually about is asked for first: the choice
     * while there is a choice to make, and the gateway frame once there is a
     * payment to pay. Only if neither is there does the focus fall back to
     * the first focusable element at all.
     */
    const panel = panelRef.current;
    const focus = panel?.querySelector<HTMLElement>("input[type=radio]") ?? null;
    const target =
      focus ??
      panel?.querySelector<HTMLElement>("iframe") ??
      panel?.querySelector<HTMLElement>("button, a[href]");
    target?.focus();
    return () => {
      openerRef.current?.focus?.();
    };
  }, [open, session]);

  // Escape leaves the panel, and Tab stays inside it.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // THE FOCUS CAN LEAVE THE DIALOG WITHOUT THE READER ASKING FOR IT.
      //
      // The old handler only looked at the FIRST and the LAST focusable element, so it acted when
      // the focus was on an edge and did nothing at all when the focus was somewhere else entirely
      // — including on `document.body`, which is where the focus lands when the panel swaps the
      // radio group for the gateway block and the control that had it is removed with it. From
      // there, Tab moved the focus into the PAGE BEHIND the modal: the exact thing this dialog's
      // own comment says must not happen, and the reason the trap existed.
      //
      // So the question is not "is the focus on an edge?" but "is the focus inside the dialog at
      // all?". If it is not, the focus is pulled back to the FIRST focusable element and the
      // browser's own move is refused — Shift+Tab included, because that move would land on the
      // page behind just as surely.
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !panelRef.current?.contains(active)) {
        event.preventDefault();
        first.focus();
        return;
      }

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const confirm = useCallback(() => {
    onConfirm(method);
  }, [method, onConfirm]);

  if (!open) return null;

  const methods: { id: CheckoutMethod; label: string; description: string }[] = [
    { id: "card", label: strings.checkout.cardLabel, description: strings.checkout.cardDescription },
    { id: "wallet", label: strings.checkout.walletLabel, description: strings.checkout.walletDescription },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-canvas/80 p-4 backdrop-blur-sm sm:items-center">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-pop"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="checkout-title" className="text-xl font-semibold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={strings.common.dismiss}
            title={strings.common.dismiss}
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors duration-200 hover:bg-surface-raised hover:text-ink"
          >
            <Icon name="close" size="sm" />
          </button>
        </div>

        {session ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm font-medium text-ink">{strings.checkout.gatewayTitle}</p>
            <p className="text-sm text-ink-muted">{strings.checkout.gatewayHint}</p>

            {gatewayUrl ? (
              <iframe
                src={gatewayUrl}
                title={strings.checkout.gatewayFrameLabel}
                /*
                 * THE FRAME IS SANDBOXED. The framed document is a third party's
                 * page: without `sandbox` it is fully privileged, and could
                 * navigate this window out of the dialog or submit a form to
                 * any origin. The gateway needs to run its own scripts and
                 * post its own card form, and it may open a window of its own;
                 * it is given exactly those and nothing else.
                 */
                sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-top-navigation-by-user-activation"
                className="h-96 w-full rounded-xl border border-line bg-surface-raised"
              />
            ) : (
              <p role="alert" className="text-sm text-error-ink">
                {strings.checkout.gatewayUnavailable}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              {acceptUrl ? (
                <a
                  href={acceptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-chrome-ink hover:text-chrome-hover"
                >
                  {strings.checkout.openInNewTab}
                  <Icon name="arrow" size="sm" />
                </a>
              ) : (
                <span />
              )}
              <ButtonLink href="/payments" variant="ghost" size="sm">
                {strings.checkout.viewPayments}
              </ButtonLink>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            <p className="text-sm text-ink-muted">{strings.checkout.chooseMethod}</p>

            <fieldset className="space-y-2">
              <legend className="sr-only">{strings.checkout.chooseMethod}</legend>
              {methods.map((option) => (
                <label
                  key={option.id}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors duration-200 ${
                    method === option.id
                      ? "border-accent/50 bg-accent-soft"
                      : "border-line hover:border-line-strong"
                  }`}
                >
                  <input
                    type="radio"
                    name="checkout-method"
                    value={option.id}
                    checked={method === option.id}
                    onChange={() => setMethod(option.id)}
                    className="size-5 accent-accent-fill"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{option.label}</span>
                    <span className="block text-xs text-ink-muted">{option.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
              <span className="text-sm text-ink-muted">
                {strings.checkout.totalLabel}
                <span className="hk-numeric ms-2 font-semibold text-ink">{amount}</span>
              </span>
              <Button onClick={confirm} loading={pending}>
                {pending ? strings.checkout.pendingLabel : strings.checkout.continueButton}
              </Button>
            </div>

            {error && (
              <p role="alert" className="text-sm text-error-ink">
                {error}
              </p>
            )}

            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={onClose}>
                {strings.checkout.cancelButton}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
