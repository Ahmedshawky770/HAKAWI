"use client";

import React, { useEffect, useRef, useState } from "react";

import { useStrings } from "@/components/providers/LocaleProvider";
import {
  loadCaptchaScript,
  removeCaptcha,
  renderCaptcha,
  type CaptchaProvider,
} from "@/lib/captcha";

/**
 * THE VERIFICATION, DRAWN WHEREVER THE SERVER ASKED FOR IT.
 *
 * The sign-in screen is asked for a CAPTCHA when the server says the sign-in is under a
 * watch — after too many failed attempts, from an address the server does not trust. The
 * server names the provider and the site key, and this component draws exactly that
 * widget.
 *
 * WHY IT IS DRAWN EXPLICITLY. Every provider's script can draw itself by looking for a
 * marker in the page; the explicit mode is asked for a widget in a given element instead.
 * The sign-in screen owns this one element, and a page-wide instruction from a
 * third-party script is not something it should hand over.
 *
 * WHY THE TOKEN IS REPORTED AND NOT KEPT. The token is a one-time answer that the API
 * exchanges with the provider's own server. It is handed upwards the moment the widget
 * produces it, and the widget is reset when the reader tries again — a token is good for
 * one verification, and the second attempt with it would be refused.
 */
interface CaptchaFieldProps {
  provider: CaptchaProvider;
  siteKey: string;
  /** Called with the token the widget produced, or `null` when there is none. */
  onToken: (token: string | null) => void;
}

export function CaptchaField({ provider, siteKey, onToken }: CaptchaFieldProps) {
  const strings = useStrings();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadCaptchaScript(provider)
      .then(() => {
        if (cancelled) return;
        const container = containerRef.current;
        if (!container) return;
        widgetIdRef.current = renderCaptcha(provider, container, siteKey, onToken);
      })
      .catch(() => {
        // A provider that does not answer must not leave the reader looking at an empty
        // box and wondering whether they did something wrong. It is said plainly: the
        // verification could not be drawn, and the attempt can be made again.
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null) {
        removeCaptcha(provider, widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [provider, siteKey, onToken]);

  if (failed) {
    return (
      <div role="alert" className="rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error-ink">
        {strings.auth.captchaUnavailable}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div ref={containerRef} />
      <p className="text-xs text-ink-muted">{strings.auth.captchaLabel}</p>
    </div>
  );
}
