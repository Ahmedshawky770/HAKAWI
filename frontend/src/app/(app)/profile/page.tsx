"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";

import { api, getStoredUser } from "@/lib/api";
import { LOGIN_ROUTE } from "@/lib/routes";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, PageHeader } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Loading } from "@/components/ui/Loading";
import { StatCard } from "@/components/ui/StatCard";
import { PublicUserProfile, UserStats } from "@/types/api";

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
    </div>
  );
}