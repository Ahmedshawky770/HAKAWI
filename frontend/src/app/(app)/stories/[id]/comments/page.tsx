import { Metadata } from "next";

import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `التعليقات - القصة ${id}`,
    description: "تعليقات القصة",
  };
}

/**
 * The comments of one story.
 *
 * This route used to render "سيتم تحميل التعليقات هنا" next to a spinner import it
 * never used — it promised a list the page never fetched, which reads as a broken
 * page rather than an unfinished one. It says what is true instead: the comments
 * endpoint is not wired to this view yet, and here is the way back to the story
 * that does work.
 *
 * No request is invented. The API client has `api.getComments(storyId)`, but
 * wiring it here would mean choosing a rendering — pagination, a composer, a
 * moderation surface — that belongs with the feature, not guessed at to fill a
 * route.
 */
export default async function StoryCommentsPage({ params }: Props) {
  const { id } = await params;

  return (
    <div>
      <PageHeader title="التعليقات" description={`تعليقات القصة ${id}`} />
      <EmptyState
        icon="comment"
        title="لا تُعرض التعليقات بعد"
        description="قائمة التعليقات لم تُربط بمسارها في واجهة البرمجة بعد. اقرأ القصة وشارك رأيك من صفحة القصة نفسها."
        action={
          <ButtonLink href={`/stories/${id}`} variant="secondary">
            العودة للقصة
          </ButtonLink>
        }
      />
    </div>
  );
}