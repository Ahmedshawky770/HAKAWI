import { Metadata } from "next";

import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Card";
import { CommentListEmpty, CommentListSkeleton, CommentRow } from "@/components/social/CommentRow";
import { api } from "@/lib/api";

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

export default async function StoryCommentsPage({ params }: Props) {
  const { id } = await params;

  const comments = await api.getComments(id, { page: 1, limit: 20 }).catch(() => null);

  return (
    <div>
      <PageHeader title="التعليقات" description={`تعليقات القصة ${id}`} />
      {!comments || comments.comments.length === 0 ? (
        <CommentListEmpty />
      ) : (
        <div className="space-y-3">
          {comments.comments.map((comment) => (
            <CommentRow key={comment.id} comment={comment} />
          ))}
        </div>
      )}
      <div className="mt-6">
        <ButtonLink href={`/stories/${id}`} variant="secondary">
          العودة للقصة
        </ButtonLink>
      </div>
    </div>
  );
}
