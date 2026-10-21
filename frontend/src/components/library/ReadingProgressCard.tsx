"use client";

import React from "react";

import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useLocale } from "@/components/providers/LocaleProvider";
import { formatDate } from "@/lib/i18n";
import type { ReadingProgress } from "@/types/api";

/**
 * Reading progress — the number a reader in the middle of a book comes back for.
 *
 * `ProgressBar` carries `role="progressbar"` and `aria-valuenow`, so the bar is readable and not
 * merely visible; the page position and the percentage repeat it as text in `hk-numeric`, because a
 * bar alone tells a screen-reader user nothing and a percentage alone is hard to compare with a page
 * number. The bar turns to the success token once the book is finished, and the completion date is
 * stated in words beside it — colour is never the only signal.
 *
 * Shared by the library detail and the rental detail, which are the same surface with a different
 * action attached. Its copy therefore lives in the LIBRARY namespace, not in two copies of itself.
 */
export function ReadingProgressCard({
  progress,
  action,
}: {
  progress: ReadingProgress;
  action?: React.ReactNode;
}) {
  const { intl, strings } = useLocale();
  const { library } = strings;

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-semibold text-ink">{library.progressTitle}</h2>
      </CardHeader>

      <CardBody>
        <ProgressBar
          value={progress.progressPercentage}
          label={library.progressLabel}
          tone={progress.completedAt ? "success" : "accent"}
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
          <span className="hk-numeric">
            {library.progressPage(progress.currentPage, progress.totalPages)}
          </span>
          <span className="hk-numeric">{progress.progressPercentage.toFixed(1)}%</span>
        </div>

        {progress.lastReadAt && (
          <p className="mt-2 text-xs text-ink-muted">
            {library.lastReadLabel} {formatDate(progress.lastReadAt, intl)}
          </p>
        )}

        {progress.completedAt && (
          <p className="mt-2 flex items-center gap-2 text-sm font-medium text-success-ink">
            <Icon name="check" size="sm" />
            {library.progressCompletedLabel} {formatDate(progress.completedAt, intl)}
          </p>
        )}
      </CardBody>

      {action && <CardFooter>{action}</CardFooter>}
    </Card>
  );
}
