"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";

import { api, getStoredUser } from "@/lib/api";
import { LOGIN_ROUTE } from "@/lib/routes";
import { professionalProgress } from "@/lib/account";
import { ButtonLink, Button } from "@/components/ui/Button";
import { Card, CardBody, PageHeader } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Loading } from "@/components/ui/Loading";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { PublicUserProfile, UserStats } from "@/types/api";

function ProgressRow({
  label,
  current,
  threshold,
  percent,
  met,
}: {
  label: string;
  current: number;
  threshold: number;
  percent: number;
  met: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-ink">{label}</span>
        <span className="text-ink-muted">{current} / {threshold}</span>
      </div>
      <div className="h-2 bg-line rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            met ? "bg-success" : "bg-accent"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * The reader's OWN profile.
 *
 * WHY THE ID COMES FROM THE SESSION AND NOT FROM THE ROUTE. This page used to
 * read `useParams().id`, but `/profile` is a static route: there is no `id` in
 * the path, so the lookup was always empty and the page rendered "معرف المستخدم
 * مفقود" for every signed-in reader — a permanent dead end on the route the
 * header links to. The reader's id is a fact the session already carries
 * (`getStoredUser()`), and without one there is nothing to render, so the reader
 * goes to the login route instead.
 *
 * The stats are a second, optional call: a profile without its counters is still
 * a profile, so a failed `/users/:id/stats` renders zeros rather than an error.
 */
export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const stored = getStoredUser();
      if (!stored) {
        router.push(LOGIN_ROUTE);
        return;
      }

      try {
        const data = await api.getUser(stored.id);
        setUser(data);
        try {
          const userStats = await api.getUserStats(stored.id);
          setStats(userStats);
        } catch {
          setStats(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "فشل تحميل الملف الشخصي");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  if (loading) return <Loading />;
  if (error) return <ErrorMessage error={error} />;
  if (!user) return <div className="text-ink-muted">المستخدم غير موجود</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="الملف الشخصي"
        action={
          <ButtonLink href="/profile/edit" variant="secondary">
            <Icon name="pen" size="sm" />
            تعديل الملف الشخصي
          </ButtonLink>
        }
      />

      <Card>
        <CardBody>
          <div className="flex flex-col items-start gap-6 sm:flex-row">
            <Avatar src={user.avatar} name={user.name} size="xl" />

            <div className="min-w-0 flex-1">
              <h2 className="font-arabic-heading text-2xl font-bold text-ink">{user.name}</h2>
              <p className="font-latin text-sm text-ink-muted">@{user.username}</p>
              <Badge state={user.accountType ?? "reader"} className="mt-3 inline-block">
                {({
                  reader: "قارئ",
                  writer: "كاتب",
                  rising_star: "كاتب ناشئ",
                  professional: "كاتب محترف",
                  publisher: "دار نشر",
                  admin: "مدير النظام",
                } as Record<string, string>)[user.accountType ?? "reader"]}
              </Badge>
              <p className="mt-3 text-sm leading-7 text-ink-muted">{user.bio || "لا توجد نبذة شخصية بعد"}</p>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="قصة" value={stats?.storiesCount ?? 0} icon="book" />

        {/* The two counters that have a list behind them are links to it. */}
        <Link
          href={`/users/${user.id}/followers`}
          className="block rounded-xl focus-visible:outline-2 transition-shadow duration-200 hover:shadow-card"
        >
          <StatCard label="متابع" value={stats?.followersCount ?? 0} icon="users" className="h-full" />
        </Link>
        <Link
          href={`/users/${user.id}/following`}
          className="block rounded-xl focus-visible:outline-2 transition-shadow duration-200 hover:shadow-card"
        >
          <StatCard label="متابَع" value={stats?.followingCount ?? 0} icon="users" className="h-full" />
        </Link>
      </div>

      {user.accountType !== "professional" && user.accountType !== "publisher" && user.accountType !== "admin" && (
        <Card>
          <CardBody>
            <h3 className="font-arabic-heading text-lg font-semibold text-ink mb-4">الترقية إلى كاتب محترف</h3>
            <p className="text-sm text-ink-muted mb-4">
              حقق العتبات التالية لترقية حسابك إلى &ldquo;كاتب محترف&rdquo; (يُمكّنك من بيع الكتب والتحليلات الكاملة):
            </p>
            <div className="space-y-3">
              {(() => {
                const progress = professionalProgress(user, stats);
                return (
                  <>
                    <ProgressRow
                      label="قصص منشورة"
                      current={progress.storiesCount.current}
                      threshold={progress.storiesCount.threshold}
                      percent={progress.storiesCount.percent}
                      met={progress.storiesCount.met}
                    />
                    <ProgressRow
                      label="مشاهدات القصص"
                      current={progress.totalViews.current}
                      threshold={progress.totalViews.threshold}
                      percent={progress.totalViews.percent}
                      met={progress.totalViews.met}
                    />
                    <ProgressRow
                      label="تفاعلات القصص"
                      current={progress.totalReactions.current}
                      threshold={progress.totalReactions.threshold}
                      percent={progress.totalReactions.percent}
                      met={progress.totalReactions.met}
                    />
                    <ProgressRow
                      label="متابعون"
                      current={progress.followersCount.current}
                      threshold={progress.followersCount.threshold}
                      percent={progress.followersCount.percent}
                      met={progress.followersCount.met}
                    />
                    <ProgressRow
                      label="بريد إلكتروني مؤكد"
                      current={progress.isVerified.met ? 1 : 0}
                      threshold={1}
                      percent={progress.isVerified.met ? 100 : 0}
                      met={progress.isVerified.met}
                    />
                  </>
                );
              })()}
            </div>
            {(() => {
              const progress = professionalProgress(user, stats);
              if (!progress.eligible) return null;
              return (
                <div className="mt-4">
                  <Button
                    onClick={async () => {
                      try {
                        const result = await api.professionalRequest();
                        if (result.eligible) {
                          alert("أنت مؤهل للترقية! تم إرسال طلبك للمراجعة من قبل موظف التحقق.");
                        } else {
                          alert("غير مؤهل: " + result.reasons.join("، "));
                        }
                      } catch (e) {
                        alert("فشل طلب الترقية: " + (e instanceof Error ? e.message : String(e)));
                      }
                    }}
                    className="w-full"
                  >
                    طلب الترقية إلى كاتب محترف
                  </Button>
                </div>
              );
            })()}
          </CardBody>
        </Card>
      )}
    </div>
  );
}