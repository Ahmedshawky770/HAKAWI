"use client";

import React from "react";

import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { ProgressBar } from "@/components/ui/ProgressBar";
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
 * action attached.
 */
export function ReadingProgressCard({
  progress,
  action,
}: {
  progress: ReadingProgress;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-semibold text-ink">تقدم القراءة</h2>
      </CardHeader>

      <CardBody>
        <ProgressBar
          value={progress.progressPercentage}
          label="تقدم القراءة"
          tone={progress.completedAt ? "success" : "accent"}
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
          <span className="hk-numeric">
            الصفحة {progress.currentPage}
            {progress.totalPages ? ` من ${progress.totalPages}` : ""}
          </span>
          <span className="hk-numeric">{progress.progressPercentage.toFixed(1)}%</span>
        </div>

        {progress.lastReadAt && (
          <p className="mt-2 text-xs text-ink-muted">
            آخر قراءة: {new Date(progress.lastReadAt).toLocaleDateString("ar-EG")}
          </p>
        )}

        {progress.completedAt && (
          <p className="mt-2 flex items-center gap-2 text-sm font-medium text-success-ink">
            <Icon name="check" size="sm" />
            اكتملت القراءة: {new Date(progress.completedAt).toLocaleDateString("ar-EG")}
          </p>
        )}
      </CardBody>

      {action && <CardFooter>{action}</CardFooter>}
    </Card>
  );
}
