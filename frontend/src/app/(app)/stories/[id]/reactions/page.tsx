import { Metadata } from "next";

import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Card";
import { RetrySurface } from "@/components/ui/RetrySurface";
import { ReactionListEmpty, ReactionRow } from "@/components/social/ReactionRow";
import { api } from "@/lib/api";
import { getStoryOnce } from "@/lib/server-story";
import { stringsFor } from "@/lib/i18n";
import { classifyError } from "@/lib/errors";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * The title of the page is the title of the STORY, not the title of the route.
 *
 * The metadata used to be `التفاعلات - القصة {id}` — a string with a database
 * id in it, in the browser tab, in the link preview and in the search result.
 * The story's own title is one request away, and it is what a reader
 * recognises.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const strings = stringsFor("ar");
  const story = await getStoryOnce(id).catch(() => null);

  if (!story) {
    return {
      title: strings.story.reactionsTitle,
      description: strings.story.reactionsDescription(""),
    };
  }

  return {
    title: strings.story.reactionsPageTitle(story.title),
    description: story.excerpt ?? strings.story.reactionsDescription(story.title),
  };
}

export default async function StoryReactionsPage({ params }: Props) {
  const { id } = await params;
  const strings = stringsFor("ar");

  const story = await getStoryOnce(id).catch(() => null);
  const storyTitle = story?.title ?? id;

  const result = await api
    .getReactions(id, { page: 1, limit: 20 })
    .then((data) => ({ data, error: null as unknown }))
    .catch((error: unknown) => ({ data: null, error }));

  return (
    <div>
      <PageHeader
        title={strings.story.reactionsTitle}
        description={strings.story.reactionsDescription(storyTitle)}
      />
      {result.data === null ? (
        // A failed fetch is not an empty list of reactions.
        <RetrySurface errorCode={classifyError(result.error)} />
      ) : result.data.reactions.length === 0 ? (
        <ReactionListEmpty />
      ) : (
        <div className="space-y-3">
          {result.data.reactions.map((reaction) => (
            <ReactionRow key={reaction.id} reaction={reaction} />
          ))}
        </div>
      )}
      <div className="mt-6">
        <ButtonLink href={`/stories/${id}`} variant="secondary">
          {strings.story.backToStory}
        </ButtonLink>
      </div>
    </div>
  );
}
