"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useStoredUser } from "@/lib/use-stored-user";
import { LOGIN_ROUTE } from "@/lib/routes";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, PageHeader } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Loading } from "@/components/ui/Loading";
import { useStrings } from "@/components/providers/LocaleProvider";
import { classifyError } from "@/lib/errors";
import { isFailedLoad, useInvalidation, useUserProfile } from "@/lib/queries";

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
  const strings = useStrings();
  const invalidate = useInvalidation();

  /**
   * The session, from the store.
   *
   * The page renders a reader with no session as an empty form over an empty
   * id, and sends them to the login route — so the session is read through the
   * store rather than out of local storage during render: the server has no
   * local storage, and the id it would read there is not the reader's. See
   * `lib/use-stored-user.ts`.
   */
  const storedUser = useStoredUser();
  const hasSession = Boolean(storedUser);
  const userId = storedUser?.id ?? "";

  const profileQuery = useUserProfile(userId);

  // A failed BACKGROUND refetch keeps the profile on the screen; only a load

  // that never arrived is a failed profile.

  const failed = isFailedLoad(profileQuery);

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");

  /**
   * The form is seeded ONCE, from the loaded profile.
   *
   * The query can refetch under the editor's feet — a window focus, another tab
   * saving the same profile — and re-seeding on every answer would wipe what the
   * reader was typing. The ref remembers that the fields have been filled once.
   */
  const seeded = useRef(false);
  useEffect(() => {
    if (profileQuery.data && !seeded.current) {
      seeded.current = true;
      setName(profileQuery.data.name);
      setBio(profileQuery.data.bio ?? "");
    }
  }, [profileQuery.data]);

  useEffect(() => {
    if (!hasSession) router.push(LOGIN_ROUTE);
  }, [router, hasSession]);

  const saveMutation = useMutation({
    mutationFn: () => api.updateUser(userId, { name, bio }),
    onSuccess: async () => {
      await invalidate.users(userId);
      router.push("/profile");
    },
  });

  if (profileQuery.isLoading) {
    return <Loading />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={strings.profile.editTitle} description={strings.profile.editDescription} />

      {failed && (
        <ErrorMessage
          error={strings.errors[classifyError(profileQuery.error)]}
          title={strings.profile.profileLoadFailed}
          onRetry={() => void profileQuery.refetch()}
        />
      )}

      <Card>
        <CardBody>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!hasSession) {
                router.push(LOGIN_ROUTE);
                return;
              }
              saveMutation.mutate();
            }}
            className="space-y-5"
          >
            {saveMutation.isError && (
              <ErrorMessage
                error={strings.errors[classifyError(saveMutation.error)]}
                title={strings.profile.editSaveFailed}
              />
            )}

            <Input label={strings.profile.editNameLabel} type="text" required value={name} onChange={(e) => setName(e.target.value)} />
            <Textarea
              label={strings.profile.editBioLabel}
              rows={4}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={strings.profile.editBioPlaceholder}
            />

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={saveMutation.isPending}>
                {strings.profile.editSaveButton}
              </Button>
              <Button variant="ghost" type="button" onClick={() => router.back()}>
                {strings.profile.editCancelButton}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
