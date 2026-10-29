import { Metadata } from "next";

import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { getStoryOnce } from "@/lib/server-story";
import { stringsFor } from "@/lib/i18n";
import { CommentsSection } from "./CommentsSection";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const strings = stringsFor("ar");
  const story = await getStoryOnce(id).catch(() => null);

  if (!story) {
    return {
      title: strings.story.commentsTitle,
      description: strings.story.commentsDescription(""),
    };
  }

  return {
    title: strings.story.commentsPageTitle(story.title),
    description: story.excerpt ?? strings.story.commentsDescription(story.title),
  };
}

export default async function StoryCommentsPage({ params }: Props) {
  const { id } = await params;
  const strings = stringsFor("ar");

  const story = await getStoryOnce(id).catch(() => null);

  return (
    <div className="space-y-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-ink">{strings.story.commentsTitle}</h1>
        </div>
        {story && (
          <ButtonLink href={`/stories/${id}`} variant="secondary">
            <Icon name="chevron" size="sm" className="mr-1 rotate-180" />
            {strings.story.backToStory}
          </ButtonLink>
        )}
      </header>

      <CommentsSection storyId={id} />
    </div>
  );
}
