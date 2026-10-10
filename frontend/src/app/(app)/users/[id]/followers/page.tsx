import { Metadata } from "next";

import { PageHeader } from "@/components/ui/Card";
import { FollowListEmpty, FollowListSkeleton, FollowListRow } from "@/components/social/FollowListRow";
import { api } from "@/lib/api";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `المتابعون - المستخدم ${id}`,
    description: "قائمة متابعي المستخدم",
  };
}

export default async function UserFollowersPage({ params }: Props) {
  const { id } = await params;

  const data = await api.getFollowers(id, { page: 1, limit: 20 }).catch(() => null);

  return (
    <div>
      <PageHeader title="المتابعون" description="من يتابع هذا الحساب" />
      {!data || data.followers.length === 0 ? (
        <FollowListEmpty />
      ) : (
        <div className="space-y-3">
          {data.followers.map((follow) => (
            <FollowListRow key={follow.id} follow={follow} />
          ))}
        </div>
      )}
    </div>
  );
}
