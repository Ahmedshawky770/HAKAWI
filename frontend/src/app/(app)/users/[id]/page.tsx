"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardFooter } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Loading } from "@/components/ui/Loading";
import { PublicUserProfile } from "@/types/api";

/**
 * Somebody else's public profile.
 *
 * The page renders what the profile endpoint answers and nothing else: there is
 * no follow control here because this client has no state to follow with — no
 * session, no cached relationship, and a follow button that always guesses
 * would be a control that lies. The footer offers the two lists that do exist
 * as routes instead.
 */
export default function PublicUserPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [user, setUser] = useState<PublicUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  React.useEffect(() => {
    async function load() {
      try {
        const resolvedId = Array.isArray(id) ? id[0] : id;
        if (!resolvedId) {
          setError("معرف المستخدم مفقود");
          setLoading(false);
          return;
        }
        const data = await api.getUser(resolvedId);
        setUser(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "فشل تحميل الملف الشخصي");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return <Loading />;
  if (error) return <ErrorMessage error={error} />;
  if (!user) return <div className="text-ink-muted">المستخدم غير موجود</div>;

  return (
    <Card>
      <CardBody>
        <div className="flex flex-col items-start gap-6 sm:flex-row">
          <Avatar src={user.avatar} name={user.name} size="xl" />

          <div className="min-w-0 flex-1">
            <h1 className="font-arabic-heading text-2xl font-bold text-ink">{user.name}</h1>
            <p className="font-latin text-sm text-ink-muted">@{user.username}</p>
            <p className="mt-3 text-sm leading-7 text-ink-muted">{user.bio || "لا توجد نبذة شخصية بعد"}</p>
          </div>
        </div>
      </CardBody>

      <CardFooter>
        <ButtonLink href={`/users/${user.id}/followers`} variant="ghost" size="sm">
          المتابعون
        </ButtonLink>
        <ButtonLink href={`/users/${user.id}/following`} variant="ghost" size="sm">
          المتابَعون
        </ButtonLink>
      </CardFooter>
    </Card>
  );
}