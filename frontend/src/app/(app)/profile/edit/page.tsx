"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getStoredUser } from "@/lib/api";
import { LOGIN_ROUTE } from "@/lib/routes";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, PageHeader } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Loading } from "@/components/ui/Loading";

/**
 * The editor for the reader's own profile.
 *
 * The page loads the current profile rather than seeding the form from the
 * stored session, because the session copy is the one summary the backend
 * updates lazily: it is what the header renders, not what this form should
 * overwrite. A reader with no session has nothing to edit, so the page leaves
 * for the login route instead of rendering an empty form over an empty id.
 */
export default function EditProfilePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
        setName(data.name);
        setBio((data as unknown as { bio?: string }).bio || "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "فشل تحميل الملف الشخصي");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const stored = getStoredUser();
      if (!stored) {
        router.push(LOGIN_ROUTE);
        return;
      }
      await api.updateUser(stored.id, { name, bio });
      router.push("/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل تحديث الملف الشخصي");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <PageHeader title="تعديل الملف الشخصي" description="الاسم والنبذة هما ما يراه القراء على قصصك" />

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <ErrorMessage error={error} />}

            <Input label="الاسم الكامل" type="text" required value={name} onChange={(e) => setName(e.target.value)} />
            <Textarea
              label="النبذة الشخصية"
              rows={4}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="أخبرنا عن نفسك..."
            />

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={saving}>
                حفظ التغييرات
              </Button>
              <Button variant="ghost" type="button" onClick={() => router.back()}>
                إلغاء
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}