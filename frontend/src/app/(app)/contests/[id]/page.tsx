"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon } from "@/components/ui/Icon";
import { ContestStatusBadge } from "@/components/social/ContestStatusBadge";
import { useLocale } from "@/components/providers/LocaleProvider";
import { useToast } from "@/components/providers/ToastProvider";
import type { Contest } from "@/types/api";

export default function ContestDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const { intl } = useLocale();
  const { notify } = useToast();

  const [contest, setContest] = useState<Contest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [storyId, setStoryId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api.getContest(id);
      setContest(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تحميل المسابقة");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // Fire-and-forget; the retry below calls this same `load`.
    async function initialLoad() {
      await load();
    }
    void initialLoad();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      await api.submitEntry(id, storyId);
      setStoryId("");
      notify("تم إرسال مشاركتك بنجاح", "success");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "تعذّر إرسال المشاركة");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader title="المسابقة" />
        <p role="status" className="sr-only">
          جارٍ التحميل…
        </p>
        <Card>
          <CardBody className="space-y-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-24 w-full" />
          </CardBody>
        </Card>
      </>
    );
  }

  if (error) {
    return (
      <ErrorMessage
        error={error}
        title="تعذّر تحميل المسابقة"
        onRetry={() => {
          setLoading(true);
          setError("");
          void load();
        }}
      />
    );
  }

  if (!contest) {
    return <ErrorMessage error="المسابقة غير موجودة" title="لا توجد مسابقة بهذا المعرّف" />;
  }

  const formatDate = (value: string): string => new Date(value).toLocaleDateString(intl);

  const facts: { label: string; value: React.ReactNode }[] = [
    { label: "التصنيف", value: contest.categoryId ?? "—" },
    { label: "الحالة", value: <ContestStatusBadge status={contest.status} /> },
    { label: "تاريخ البداية", value: <span className="hk-numeric">{formatDate(contest.startDate)}</span> },
    { label: "تاريخ النهاية", value: <span className="hk-numeric">{formatDate(contest.endDate)}</span> },
    {
      label: "آخر موعد للمشاركة",
      value: <span className="hk-numeric">{formatDate(contest.submissionDeadline)}</span>,
    },
    { label: "الفائز", value: contest.winnerId ?? "—" },
  ];

  return (
    <div className="animate-rise">
      <Link
        href="/contests"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-chrome-ink hover:text-chrome"
      >
        <Icon name="chevron" size="sm" />
        العودة إلى المسابقات
      </Link>

      <PageHeader title={contest.title} />

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-ink">تفاصيل المسابقة</h2>
        </CardHeader>
        <CardBody className="space-y-6">
          {contest.description && (
            <p className="text-base leading-8 text-ink-muted">{contest.description}</p>
          )}

          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-sm text-ink-muted">{fact.label}</dt>
                <dd className="mt-1 font-medium text-ink">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <h2 className="text-lg font-semibold text-ink">شارك بمشاركتك</h2>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            {submitError && (
              <ErrorMessage error={submitError} title="تعذّر إرسال المشاركة" />
            )}

            <Input
              label="معرّف القصة"
              type="text"
              required
              value={storyId}
              onChange={(e) => setStoryId(e.target.value)}
              placeholder="أدخل معرّف القصة التي تريد تقديمها"
              wrapperClassName="max-w-md"
            />
            <Button type="submit" loading={submitting}>
              إرسال المشاركة
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}