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
    title: `التفاعلات - القصة ${id}`,
    description: "تفاعلات القصة",
  };
}

/**
 * Who reacted to one story, and with what.
 *
 * The interactive half of reactions is finished and lives on the story page: the
 * six amber types, the optimistic update and the failure toast are all in
 * `ReactionBar`. What does not exist is this page — the per-reader list of who
 * reacted — so it says so rather than rendering a promise next to an unused
 * spinner import.
 *
 * `api.getReactions(storyId)` is available and is what `ReactionBar` already calls
 * for the reader's own reaction; rendering the full list here means deciding on
 * pagination and on what an empty reaction list means for a story nobody has
 * reacted to, which belongs with the feature rather than being guessed at to fill
 * a route.
 */
export default async function StoryReactionsPage({ params }: Props) {
  const { id } = await params;

  return (
    <div>
      <PageHeader title="التفاعلات" description={`تفاعلات القصة ${id}`} />
      <EmptyState
        icon="heart"
        title="لا تُعرض قائمة المتفاعلين بعد"
        description="يمكنك التفاعل مع القصة من صفحتها؛ أمّا قائمة من تفاعل ومتى، فلم تُربط بمسارها في واجهة البرمجة بعد."
        action={
          <ButtonLink href={`/stories/${id}`} variant="secondary">
            العودة للقصة
          </ButtonLink>
        }
      />
    </div>
  );
}