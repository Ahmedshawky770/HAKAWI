import { Metadata } from "next";

import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Card";
import { RetrySurface } from "@/components/ui/RetrySurface";
import { CommentListEmpty, CommentRow } from "@/components/social/CommentRow";
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
 * The metadata used to be `التعليقات - القصة {id}` — a string with a database
 * id in it. It reached the browser tab, to the link preview when a reader
 * shared the page, and to the search engine: a page about a story, named after
 * an identifier nobody outside the database has ever seen. The story's own
 * title is one request away, and it is what a reader recognises.
 */
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
  const storyTitle = story?.title ?? id;

  const result = await api
    .getComments(id, { page: 1, limit: 20 })
    .then((data) => ({ data, error: null as unknown }))
    .catch((error: unknown) => ({ data: null, error }));

  return (
    <div>
      <PageHeader
        title={strings.story.commentsTitle}
        description={strings.story.commentsDescription(storyTitle)}
      />
      {result.data === null ? (
        // The fetch FAILED. This is not an empty list: saying "no comments" when
        // the request failed is a statement about the world that is not true.
        <RetrySurface errorCode={classifyError(result.error)} />
      ) : result.data.comments.length === 0 ? (
        <CommentListEmpty />
      ) : (
        <div className="space-y-3">
          {result.data.comments.map((comment) => (
            <CommentRow key={comment.id} comment={comment} />
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
