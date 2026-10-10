"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { useToast } from "@/components/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon } from "@/components/ui/Icon";
import { Input, Textarea } from "@/components/ui/Input";

/**
 * The composer card of §6, collapsed to a single invitation and expanded in
 * place.
 *
 * Why it lives on the feed rather than behind a link to `/stories/create`:
 * writing is the product's primary action, and a reader who has to navigate to
 * find it is a reader who does not write. The expanded state is the same form
 * the dedicated page renders — the two call one component, so validation and
 * the character counter cannot drift apart.
 *
 * Collapsed by default, and collapsing again after a publish, because a feed
 * with a permanent open editor pushes the content the reader came for off the
 * screen.
 */
export function StoryCreatorCard() {
  const router = useRouter();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const remaining = 120 - title.trim().length;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    try {
      const story = await api.createStory({
        title: title.trim(),
        content,
        category: "fiction",
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      notify("تم نشر حكايتك", "success");
      setTitle("");
      setContent("");
      setTags("");
      setOpen(false);
      router.push(`/stories/${story.id}`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "تعذّر نشر القصة");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Card interactive className="p-5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 text-start text-sm text-ink-muted transition-colors duration-200 hover:text-ink"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink">
            <Icon name="pen" size="sm" />
          </span>
          اكتب حكايتك هنا…
          <Icon name="plus" size="sm" className="ms-auto text-chrome-ink" />
        </button>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        {error && <ErrorMessage error={error} />}

        <Input
          label="العنوان"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="عنوان يلفت الانتباه"
          required
          maxLength={120}
          hint={remaining <= 0 ? "وصلت الحد الأقصى لطول العنوان" : `${remaining} حرفاً متبقياً`}
        />

        <Textarea
          label="الحكاية"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="اكتب حكايتك هنا…"
          rows={6}
          required
        />

        <Input
          label="الوسوم"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="رعب، غموض، واقعي"
          hint="افصل بين الوسوم بفاصلة"
        />

        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={pending}>
            انشر القصة
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            إغلاق
          </Button>
        </div>
      </form>
    </Card>
  );
}
