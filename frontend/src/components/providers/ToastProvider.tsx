"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { useStrings } from "@/components/providers/LocaleProvider";
import { Icon } from "@/components/ui/Icon";

export type ToastTone = "info" | "success" | "warning" | "error";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  notify: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Errors stay long enough to be read; confirmations get out of the way. */
const DISMISS_AFTER_MS = 5000;

const TONE_CLASSES: Record<ToastTone, string> = {
  info: "border-line-strong bg-surface-raised text-ink",
  success: "border-success/40 bg-success-soft text-success-ink",
  warning: "border-warning/40 bg-warning-soft text-warning-ink",
  error: "border-error/40 bg-error-soft text-error-ink",
};

const TONE_ICON: Record<ToastTone, string> = {
  info: "ℹ",
  success: "✓",
  warning: "⚠",
  error: "✕",
};

/**
 * HOW MUCH OF THE MESSAGE THE CLOSE BUTTON'S NAME CARRIES.
 *
 * The name has to say WHICH toast the button closes, and the toast's own text
 * is what the reader is looking at when they press it. A message is a
 * sentence though, and an accessible name is not the place for a paragraph, so
 * a long one is cut — the beginning is the part that identifies the message.
 */
const MAX_DISMISS_LABEL_LENGTH = 60;

/**
 * THE NAME OF A CLOSE BUTTON HAS TO SAY WHICH TOAST IT CLOSES.
 *
 * Every toast's close button was named "Dismiss" (or "إغلاق") and nothing
 * else, so a reader with three toasts on screen met three buttons that
 * announced exactly the same thing: a screen reader user tabbing through them
 * heard "Dismiss, button" three times and had no way to tell which message
 * each one would take away. The name is the dismiss verb and the toast's own
 * text, which is the thing the reader is reading when they press it.
 */
function dismissLabel(dismiss: string, message: string): string {
  const text =
    message.length > MAX_DISMISS_LABEL_LENGTH
      ? `${message.slice(0, MAX_DISMISS_LABEL_LENGTH).trimEnd()}…`
      : message;
  return `${dismiss}: ${text}`;
}

/**
 * Transient feedback for actions whose result the user cannot otherwise see.
 *
 * The design system's optimistic pattern updates a count immediately and reverts
 * it if the request fails. A silent revert is indistinguishable from a bug, so
 * the revert is also announced here: `role="status"` for everything a reader
 * chose to do, `role="alert"` for failures.
 *
 * THE TOAST IS NOT A BUTTON. It used to be one `<button>` whose accessible name
 * was the message text, so a screen reader announced "فشل تحميل… , button" for
 * a message that was never a control, and the button's own purpose — closing
 * the toast — was invisible to anyone who could not infer it. The toast is now
 * a container (`role="alert"` for a failure, otherwise the polite live region
 * of its parent) and the ONLY control inside it is a small close button with an
 * explicit name.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const strings = useStrings();

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DISMISS_AFTER_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* A live region WITHOUT `role="status"`. The role would make this empty
          region match `getByRole("status")` on every page in the product, so the
          first loading state and the first toast would be indistinguishable in
          a test and ambiguous for a screen reader scanning landmarks. A bare
          `aria-live` announces additions exactly the same. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex max-w-sm items-center gap-2 rounded-xl border py-1 ps-4 pe-1 text-sm shadow-pop transition-colors duration-200 hover:border-accent/40 ${TONE_CLASSES[toast.tone]}`}
            role={toast.tone === "error" ? "alert" : undefined}
          >
            <span aria-hidden="true" className="font-bold">
              {TONE_ICON[toast.tone]}
            </span>
            <p className="text-start">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label={dismissLabel(strings.common.dismiss, toast.message)}
              title={strings.common.dismiss}
              className="-me-0.5 flex size-11 shrink-0 items-center justify-center rounded-lg text-current opacity-70 transition-opacity duration-200 hover:opacity-100"
            >
              <Icon name="close" size="sm" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return context;
}
