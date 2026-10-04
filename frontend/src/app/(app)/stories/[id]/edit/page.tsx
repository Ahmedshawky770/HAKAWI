"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, PageHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { STORY_CATEGORIES } from "@/components/story/StoryCategoryOptions";
import type { Story } from "@/types/api";

const TITLE_LIMIT = 120;

/**
 * The edit-story form: the create form, pre-filled.
 *
 * TWO ERROR STATES, NOT ONE. The page used to keep a single `error` string for
 * both "the story would not load" and "the save was rejected", and then returned
 * the whole page for that error — so a rejected save unmounted the form and threw
 * away everything the writer had typed. A failure of the LOAD replaces the page
 * (there is nothing to edit); a failure of the SAVE is announced at the top of the
 * form, which is still full of the reader's work.
 *
 * The category list gains the story's own category when it is not one of the four
 * known values. A `<select>` can only show its own options, so a story filed under
 * any other category used to display the first option while submitting the real
 * one — the control disagreed with the payload, and the writer could not tell which
 * of the two the server would store.
 *
 * Submission is unchanged: the same `api.updateStory` payload, the same redirect to
 * the story.
 */
export default function EditStoryPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";

  const [story, setStory] = useState<Story | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("fiction");
  const [tags, setTags] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");

  const load = useCallback(() => {
    api
      .getStory(id)
      .then(
        (data) => {
          setStory(data);
          setTitle(data.title);
          setContent(data.content || "");
          setCategory(data.category ?? "");
          setTags((data.tags || []).join(", "));
        },
        (failure) => setLoadError(failure instanceof Error ? failure.message : "فشل تحميل القصة"),
      )
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Retry owns the "start again" state, so the mounting effect stays async-only. */
  function retry() {
    setLoading(true);
    setLoadError("");
    void load();
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");

    try {
      await api.updateStory(id, {
        title,
        content,
        category,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      router.push(`/stories/${id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "فشل تحديث القصة");
    } finally {
      setSaving(false);
    }
  };

  const remaining = TITLE_LIMIT - title.trim().length;
  const options =
    category && !STORY_CATEGORIES.some((option) => option.value === category)
      ? [...STORY_CATEGORIES, { value: category, label: category }]
      : STORY_CATEGORIES;

  return (
    <div>
      <PageHeader title="تعديل القصة" description="عدّل ما كتبته، وستبقى التعديلات على القصة نفسها." />

      {loading ? (
        <div aria-busy="true">
          <span role="status" className="sr-only">
            جارٍ التحميل…
          </span>
          <Card className="p-6">
            {/* Mirrors the form's own field order and heights — title, body, then
                the two short fields — so the card does not resize on arrival. */}
            <div className="space-y-5">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-11 w-full" rounded="rounded-lg" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-32 w-full" rounded="rounded-lg" />
              </div>
              {Array.from({ length: 2 }, (_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-11 w-full" rounded="rounded-lg" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : loadError ? (
        <ErrorMessage
          error={loadError}
          title="تعذّر فتح القصة للتعديل"
          onRetry={retry}
          retryLabel="أعد المحاولة"
        />
      ) : !story ? (
        <EmptyState
          icon="book"
          title="القصة غير موجودة"
          description="ربما حُذفت أو تغيّر رابطها."
          action={
            <ButtonLink href="/stories" variant="secondary">
              العودة للقصص
            </ButtonLink>
          }
        />
      ) : (
        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-5">
              {formError && <ErrorMessage error={formError} title="تعذّر حفظ التعديلات" />}

              <Input
                label="العنوان"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                hint={
                  remaining <= 0 ? "وصلت الحد الأقصى لطول العنوان" : `${remaining} حرفاً متبقياً`
                }
              />

              <Textarea
                label="المحتوى"
                rows={10}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                hint="اترك الحقل فارغاً إن كنت تريد حذف نص القصة."
              />

              <Select
                label="التصنيف"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                options={options}
              />

              <Input
                label="الوسوم (مفصولة بفاصلة)"
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                hint="افصل بين الوسوم بفاصلة"
              />

              <div className="flex flex-wrap gap-3">
                <Button type="submit" loading={saving}>
                  حفظ التغييرات
                </Button>
                <ButtonLink href={`/stories/${id}`} variant="ghost">
                  إلغاء
                </ButtonLink>
              </div>
            </form>
          </CardBody>
        </Card>
      )}
    </div>
  );
}