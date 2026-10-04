import { Metadata } from "next";

import { PageHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `المتابَعون - المستخدم ${id}`,
    description: "قائمة المستخدمين الذين يتابعهم",
  };
}

/**
 * The following list. The same honest gap as the followers page: the endpoint
 * exists (`api.getFollowing` → `@Get('user/:userId/following')`) and this route
 * does not call it, so it renders the id and says so.
 */
export default async function UserFollowingPage({ params }: Props) {
  const { id } = await params;

  return (
    <div>
      <PageHeader title="المتابَعون" description="الحسابات التي يتابعها" />

      <p className="mb-6 text-sm text-ink-muted">
        معرّف المستخدم: <span className="hk-numeric text-ink">{id}</span>
      </p>

      <EmptyState
        icon="users"
        title="قائمة المتابَعين غير متصلة بعد"
        description="لم تُربط هذه الصفحة بعد بواجهة المتابَعين، لذا لا يمكن عرض الأسماء أو الأعداد هنا حتى ذلك."
      />
    </div>
  );
}