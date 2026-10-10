"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { api, getStoredUser } from "@/lib/api";
import { PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
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
  const [votes, setVotes] = useState<{ submissionId: string; count: number }[]>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState("");
  const [prizeSubmissionId, setPrizeSubmissionId] = useState("");
  const [prizeType, setPrizeType] = useState<string>("cash");
  const [prizeDescription, setPrizeDescription] = useState("");
  const [prizeAmount, setPrizeAmount] = useState("");
  const [prizeCurrency, setPrizeCurrency] = useState("EGP");

  const currentUserId = getStoredUser()?.id ?? null;
  const isOwner = currentUserId != null && contest != null && contest.createdBy === currentUserId;

  const load = useCallback(async () => {
    try {
      const contestData = await api.getContest(id);
      setContest(contestData);
      try {
        const votesData = await api.getVotes(id);
        const grouped = votesData.votes.reduce<{ submissionId: string; count: number }[]>((acc, vote) => {
          const existing = acc.find((item) => item.submissionId === vote.submissionId);
          if (existing) {
            existing.count += 1;
          } else {
            acc.push({ submissionId: vote.submissionId, count: 1 });
          }
          return acc;
        }, []);
        setVotes(grouped);
      } catch {
        // Votes are additive; a failure here does not block the contest from loading.
      }
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

  const handleVote = async (submissionId: string) => {
    setSubmitting(true);
    setSubmitError("");
    try {
      await api.castVote(id, submissionId);
      notify("تم تسجيل صوتك", "success");
      setVotes((prev) => {
        const existing = prev.find((item) => item.submissionId === submissionId);
        if (existing) {
          return prev.map((item) => (item.submissionId === submissionId ? { ...item, count: item.count + 1 } : item));
        }
        return [...prev, { submissionId, count: 1 }];
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "تعذّر تسجيل الصوت");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectWinner = async () => {
    if (!selectedSubmissionId) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await api.selectWinner(id, { submissionId: selectedSubmissionId, winnerId: selectedSubmissionId });
      setContest((prev) => (prev ? { ...prev, winnerId: selectedSubmissionId } : prev));
      notify("تم اختيار الفائز", "success");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "تعذّر اختيار الفائز");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDistributePrize = async () => {
    if (!prizeSubmissionId || !prizeType) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await api.distributePrize(id, {
        submissionId: prizeSubmissionId,
        winnerId: prizeSubmissionId,
        prizeType,
        prizeDescription: prizeDescription || undefined,
        amount: prizeAmount ? Number(prizeAmount) : undefined,
        currency: prizeCurrency || undefined,
      });
      notify("تم توزيع الجائزة", "success");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "تعذّر توزيع الجائزة");
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

      <Card className="mt-6">
        <CardHeader>
          <h2 className="text-lg font-semibold text-ink">الأصوات</h2>
        </CardHeader>
        <CardBody>
          {votes.length === 0 ? (
            <p className="text-sm text-ink-muted">لا توجد أصوات بعد.</p>
          ) : (
            <ul className="space-y-3">
              {votes.map((vote) => (
                <li key={vote.submissionId} className="flex items-center justify-between rounded-lg border border-line p-3">
                  <span className="text-sm text-ink-muted">معرّف المشاركة: {vote.submissionId}</span>
                  <div className="flex items-center gap-3">
                    <span className="hk-numeric text-sm font-medium text-ink">{vote.count} صوت</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={submitting}
                      onClick={() => handleVote(vote.submissionId)}
                    >
                      صوت
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {isOwner && (
        <Card className="mt-6">
          <CardHeader>
            <h2 className="text-lg font-semibold text-ink">إجراءات المالك</h2>
          </CardHeader>
          <CardBody className="space-y-5">
            <div className="space-y-3">
              <p className="text-sm font-medium text-ink-muted">اختيار الفائز</p>
              <Input
                label="معرّف المشاركة الفائزة"
                type="text"
                value={selectedSubmissionId}
                onChange={(e) => setSelectedSubmissionId(e.target.value)}
                placeholder="معرّف المشاركة"
                wrapperClassName="max-w-md"
              />
              <Button size="sm" onClick={handleSelectWinner} loading={submitting} disabled={!selectedSubmissionId}>
                اختيار الفائز
              </Button>
            </div>

            <div className="border-t border-line pt-5 space-y-3">
              <p className="text-sm font-medium text-ink-muted">توزيع الجائزة</p>
              <Input
                label="معرّف المشاركة"
                type="text"
                value={prizeSubmissionId}
                onChange={(e) => setPrizeSubmissionId(e.target.value)}
                placeholder="معرّف المشاركة"
                wrapperClassName="max-w-md"
              />
              <Select
                label="نوع الجائزة"
                value={prizeType}
                onChange={(e) => setPrizeType(e.target.value)}
                options={[
                  { value: "cash", label: "نقدي" },
                  { value: "other", label: "أخرى" },
                ]}
                wrapperClassName="max-w-md"
              />
              <Input
                label="وصف الجائزة"
                type="text"
                value={prizeDescription}
                onChange={(e) => setPrizeDescription(e.target.value)}
                placeholder="وصف الجائزة"
                wrapperClassName="max-w-md"
              />
              <Input
                label="المبلغ (بالقرش)"
                type="number"
                min={0}
                value={prizeAmount}
                onChange={(e) => setPrizeAmount(e.target.value)}
                placeholder="5000"
                wrapperClassName="max-w-md"
              />
              <Input
                label="العملة"
                type="text"
                value={prizeCurrency}
                onChange={(e) => setPrizeCurrency(e.target.value)}
                placeholder="EGP"
                wrapperClassName="max-w-md"
              />
              <Button size="sm" onClick={handleDistributePrize} loading={submitting} disabled={!prizeSubmissionId || !prizeType}>
                توزيع الجائزة
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}