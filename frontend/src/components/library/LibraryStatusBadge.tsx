"use client";

import React from "react";
import type { LibraryItemStatus } from "@hakawi/shared-types";

import { Badge, LIBRARY_STATUS_TONES, toneFor } from "@/components/ui/Badge";
import { useStrings } from "@/components/providers/LocaleProvider";

/**
 * The library state vocabulary.
 *
 * The COLOUR is not chosen here — it comes from `LIBRARY_STATUS_TONES`, which
 * the design system owns, so a "borrowed" pill is the same token-backed badge
 * on the index and on the detail page.
 *
 * The WORD is the dictionary's. The badge used to carry a table of its own, and
 * a table of its own is a table the English reader never reaches: the pill said
 * "مستأجر" inside an English interface. The vocabulary of the shelf belongs to
 * the shelf's copy, and the badge reads it.
 */
export function LibraryStatusBadge({ status }: { status: string }) {
  const { library } = useStrings();

  // A status the contract does not declare has no word, so it is shown as the
  // API sent it — the same policy the payment badge and the rental badge follow.
  const label = library.statusLabels[status as LibraryItemStatus] ?? status;

  return <Badge tone={toneFor(LIBRARY_STATUS_TONES, status)}>{label}</Badge>;
}
