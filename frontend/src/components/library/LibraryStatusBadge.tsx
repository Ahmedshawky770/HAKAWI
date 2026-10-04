"use client";

import React from "react";

import { Badge, LIBRARY_STATUS_TONES, toneFor } from "@/components/ui/Badge";

/**
 * The library state vocabulary, in Arabic. The colour is not chosen here — it comes from
 * `LIBRARY_STATUS_TONES`, which the design system owns, so a "مستأجر" pill is the same
 * token-backed badge on the index and on the detail page.
 */
export const LIBRARY_STATUS_LABELS: Record<string, string> = {
  owned: "مملوك",
  rented: "مستأجر",
  reading: "قيد القراءة",
  completed: "مكتمل",
};

export function LibraryStatusBadge({ status }: { status: string }) {
  return <Badge tone={toneFor(LIBRARY_STATUS_TONES, status)}>{LIBRARY_STATUS_LABELS[status] ?? status}</Badge>;
}
