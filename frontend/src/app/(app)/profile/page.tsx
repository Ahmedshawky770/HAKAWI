"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Card, CardBody } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { PublicUserProfile, UserStats } from "@/types/api";

export default function ProfilePage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [user, setUser] = useState<PublicUserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
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
        try {
          const userStats = await api.getUserStats(resolvedId);
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
  }, [id]);

  if (loading) return <Loading />;
  if (error) return <ErrorMessage error={error} />;
  if (!user) return <div className="p-6">المستخدم غير موجود</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Card>
        <CardBody>
          <div className="flex items-start gap-6">
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-24 h-24 rounded-full object-cover" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-white text-3xl font-bold">
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">{user.name}</h1>
              <p className="text-gray-600">@{user.username}</p>
              <p className="text-gray-500 mt-2">{user.bio || "لا توجد نبذة شخصية بعد"}</p>
              <div className="flex gap-6 mt-4">
                <div>
                  <span className="font-semibold">{stats?.storiesCount ?? 0}</span>
                  <span className="text-gray-600 ml-1">قصة</span>
                </div>
                <div>
                  <span className="font-semibold">{stats?.followersCount ?? 0}</span>
                  <span className="text-gray-600 ml-1">متابع</span>
                </div>
                <div>
                  <span className="font-semibold">{stats?.followingCount ?? 0}</span>
                  <span className="text-gray-600 ml-1">متابَع</span>
                </div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
