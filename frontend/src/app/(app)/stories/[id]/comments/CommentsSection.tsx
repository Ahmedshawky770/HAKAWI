"use client";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { CommentForm } from "@/components/social/CommentForm";
import { CommentThread } from "@/components/social/CommentThread";
import { useComments } from "@/lib/queries";
import { classifyError } from "@/lib/errors";
import { stringsFor } from "@/lib/i18n";
import type { Comment } from "@/types/api";

interface CommentsSectionProps {
  storyId: string;
}

export function CommentsSection({ storyId }: CommentsSectionProps) {
  const strings = stringsFor("ar");
  const social = strings.social;
  const query = useComments(storyId, { page: 1, limit: 50 });

  const comments: Comment[] = query.data?.comments ?? [];
  const failed = query.isError && query.data === undefined;
  const error = query.error;

  return (
    <div className="space-y-6">
      {failed ? (
        <Card className="p-6">
          <ErrorMessage
            error={strings.errors[classifyError(error)]}
            title={strings.common.errorTitle}
            retryLabel={strings.common.retry}
          />
        </Card>
      ) : comments.length === 0 ? (
        <EmptyState
          icon="comment"
          title={social.commentListEmpty.split(". ")[0]}
          description={social.commentListEmpty}
          action={
            <CommentForm storyId={storyId} className="mt-4 w-full" />
          }
        />
      ) : (
        <>
          <CommentForm storyId={storyId} className="mb-6" />
          <CommentThread comments={comments} storyId={storyId} />
        </>
      )}
    </div>
  );
}
