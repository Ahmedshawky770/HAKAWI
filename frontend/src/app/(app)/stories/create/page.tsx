"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { STORY_CATEGORIES } from "@/components/story/StoryCategoryOptions";

/** The same ceiling the inline composer enforces, so the two forms cannot drift. */
const TITLE_LIMIT = 120;

/**
 * The create-story form.
 *
 * ONE CARD, ONE FORM. The old page hand-rolled a `<label>` + `<textarea>` and a
 * `<label>` + `<select>` with raw focus rings while the two neighbouring fields
 * used the shared controls — so the title was announced one way and the body
 * another. Every field here is the shared control, which means every label,
 * error and `aria-describedby` is wired by one implementation.
 *
 * The character counter is a `hint`, not a paragraph next to the label: it is
 * part of the field's description, so it is announced with it and it occupies the
 * row the error message will take, which is why the form does not jump when a
 * field fails.
 *
 * Submission is unchanged: the same `api.createStory` payload, the same redirect
 * to the new story. A failure no longer disappears — it is announced at the top of
 * the form with the typed values still in place, so the writer can correct one
 * field instead of retyping the story.
 */
export default function CreateStoryPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("fiction");
  const [tags, setTags] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const remaining = TITLE_LIMIT - title.trim().length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await api.createStory({
        title,
        content,
        category,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      router.push(`/stories/${response.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل إنشاء القصة");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="إنشاء قصة" description="اكتب حكايتك، وامنحها تصنيفاً يقرّبها من القرّاء." />

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <ErrorMessage error={error} title="تعذّر نشر القصة" />}

            <Input
              label="العنوان"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="أدخل عنوان القصة"
              hint={remaining <= 0 ? "وصلت الحد الأقصى لطول العنوان" : `${remaining} حرفاً متبقياً`}
            />

            <Textarea
              label="المحتوى"
              rows={10}
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="اكتب قصتك هنا..."
              hint="اكتب الحكاية كما تُروى: فقرات قصيرة، وفصل بين المشاهد."
            />

            <Select
              label="التصنيف"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={STORY_CATEGORIES}
            />

            <Input
              label="الوسوم (مفصولة بفاصلة)"
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="مغامرة، غموض"
              hint="افصل بين الوسوم بفاصلة"
            />

            <div className="flex flex-wrap gap-3">
              <Button type="submit" loading={loading}>
                إنشاء القصة
              </Button>
              <ButtonLink href="/stories" variant="ghost">
                إلغاء
              </ButtonLink>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}