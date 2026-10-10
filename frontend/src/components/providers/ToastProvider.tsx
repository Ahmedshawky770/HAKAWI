"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

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
 * Transient feedback for actions whose result the user cannot otherwise see.
 *
 * The design system's optimistic pattern updates a count immediately and reverts
 * it if the request fails. A silent revert is indistinguishable from a bug, so
 * the revert is also announced here: `role="status"` for everything a reader
 * chose to do, `role="alert"` for failures.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

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
          <button
            key={toast.id}
            type="button"
            onClick={() => dismiss(toast.id)}
            className={`pointer-events-auto flex max-w-sm items-center gap-2 rounded-xl border px-4 py-2 text-sm shadow-pop transition-colors duration-200 hover:border-accent/40 ${TONE_CLASSES[toast.tone]}`}
            role={toast.tone === "error" ? "alert" : undefined}
          >
            <span aria-hidden="true" className="font-bold">
              {TONE_ICON[toast.tone]}
            </span>
            <span className="text-start">{toast.message}</span>
          </button>
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
