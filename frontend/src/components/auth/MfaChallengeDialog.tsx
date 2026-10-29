"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { useStrings } from "@/components/providers/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Input } from "@/components/ui/Input";

/**
 * THE SECOND FACTOR, ASKED FOR AT THE MOMENT IT IS NEEDED.
 *
 * SOME ACTIONS DEMAND ONE. The API marks them — the financial routes, the moderation
 * routes, the admin break-glass one — and refuses a caller who has an admin role unless the
 * request carries a TOTP code or a backup code.
 *
 * WHY IT IS ASKED FOR HERE AND NOT AT SIGN-IN. A second factor is a STEP UP, not a
 * condition of being signed in: most of what a reader does does not need one, and asking
 * for a code every time they open the app would train them to type codes into fields they
 * do not understand. The code is asked for when the action that needs it is attempted, and
 * it is asked for ONCE — the reader's phone is in their hand, at the moment they are
 * doing the thing.
 *
 * THE CODE IS NOT WRITTEN DOWN. It lives in the component's state, it is handed to the
 * request that was refused, and it is gone when the dialog closes. The server verifies it
 * against the reader's own secret and keeps no copy of it either, so there is nothing to
 * leak from here.
 *
 * IT IS A REAL DIALOG. `role="dialog"` with `aria-modal`, a label that names the step,
 * the focus moved into it on open, the focus restored to the button that opened it, Escape
 * to leave, and Tab kept inside — a reader using a keyboard must not be able to tab into
 * the page behind a modal that is covering it.
 */
interface MfaChallengeDialogProps {
  open: boolean;
  /** Called with the code the reader typed, or with `null` when they declined. */
  onSubmit: (code: string) => void;
  /** Called when the reader leaves the panel without a code. */
  onClose: () => void;
  /** The error from the last attempt, if any. */
  error?: string;
  /** True while the code is being checked. */
  pending?: boolean;
}

export function MfaChallengeDialog({ open, onSubmit, onClose, error, pending = false }: MfaChallengeDialogProps) {
  const strings = useStrings();
  const [code, setCode] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The button that opened the panel is remembered so the focus can go back to
  // it when the panel closes: a reader who closes a dialog expects to be where
  // they were, not at the top of the document.
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    // The focus lands on the FIELD, because the field is what the panel is
    // about — a reader who is asked for a code should be able to type one
    // without hunting for the box first.
    inputRef.current?.focus();
    return () => {
      openerRef.current?.focus?.();
    };
  }, [open]);

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
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // THE QUESTION IS NOT "IS THE FOCUS ON AN EDGE?" BUT "IS THE FOCUS INSIDE
      // THE DIALOG AT ALL?". If it is not, the focus is pulled back to the first
      // focusable element and the browser's own move is refused — Shift+Tab
      // included, because that move would land on the page behind just as
      // surely.
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

  const submit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const trimmed = code.trim();
      if (trimmed.length === 0) return;
      onSubmit(trimmed);
    },
    [code, onSubmit],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-4 backdrop-blur-sm">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mfa-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-pop"
      >
        <h2 id="mfa-challenge-title" className="text-lg font-bold text-ink">
          {strings.auth.mfaChallengeTitle}
        </h2>
        <p className="mt-2 text-sm text-ink-muted">{strings.auth.mfaChallengeDescription}</p>

        <form onSubmit={submit} className="mt-5 space-y-4">
          {error && <ErrorMessage error={error} />}

          <Input
            ref={inputRef}
            label={strings.auth.mfaCodeLabel}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder={strings.auth.mfaCodePlaceholder}
          />

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              {strings.common.dismiss}
            </Button>
            <Button type="submit" loading={pending} disabled={code.trim().length === 0}>
              {strings.auth.mfaChallengeConfirm}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
