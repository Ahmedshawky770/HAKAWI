import { Metadata } from "next";

import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Card";
import { ReactionListEmpty, ReactionListSkeleton, ReactionRow } from "@/components/social/ReactionRow";
import { api } from "@/lib/api";

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

export default async function StoryReactionsPage({ params }: Props) {
  const { id } = await params;

  const reactions = await api.getReactions(id, { page: 1, limit: 20 }).catch(() => null);

  return (
    <div>
      <PageHeader title="التفاعلات" description={`تفاعلات القصة ${id}`} />
      {!reactions || reactions.reactions.length === 0 ? (
        <ReactionListEmpty />
      ) : (
        <div className="space-y-3">
          {reactions.reactions.map((reaction) => (
            <ReactionRow key={reaction.id} reaction={reaction} />
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
