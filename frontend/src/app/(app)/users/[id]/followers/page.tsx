import { Metadata } from "next";

import { PageHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

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

/**
 * The followers list.
 *
 * The backend DOES serve this list — `FollowsController` → `@Get('user/:userId/followers')`
 * behind `api.getFollowers` — but this page never called it and used to claim
 * "سيتم تحميل قائمة المتابعين هنا" as though a request were on its way. So it
 * says what is true: the route exists, the id is real, and the list is not wired
 * to its endpoint yet. An empty state that names its own gap is honest; another
 * line of placeholder copy is not.
 */
export default async function UserFollowersPage({ params }: Props) {
  const { id } = await params;

  return (
    <div>
      <PageHeader title="المتابعون" description="من يتابع هذا الحساب" />

      <p className="mb-6 text-sm text-ink-muted">
        معرّف المستخدم: <span className="hk-numeric text-ink">{id}</span>
      </p>

      <EmptyState
        icon="users"
        title="قائمة المتابعين غير متصلة بعد"
        description="لم تُربط هذه الصفحة بعد بواجهة المتابعين، لذا لا يمكن عرض الأسماء أو الأعداد هنا حتى ذلك."
      />
    </div>
  );
}