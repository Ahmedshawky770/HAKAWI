"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useStoredUser } from "@/lib/use-stored-user";
import { PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { MessageBubble } from "@/components/social/MessageBubble";
import { useLocale, useStrings } from "@/components/providers/LocaleProvider";
import { classifyError } from "@/lib/errors";
import { isFailedLoad, messageKeys, useInvalidation, useMessages } from "@/lib/queries";
import type { MessagesListResponse } from "@/types/api";

export default function ConversationPage() {
  const params = useParams();
  const conversationId = typeof params.id === "string" ? params.id : "";
  const { intl } = useLocale();
  const strings = useStrings();
  const invalidate = useInvalidation();
  const queryClient = useQueryClient();

  const [newMessage, setNewMessage] = useState("");
  const [sentAnnouncement, setSentAnnouncement] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messagesQuery = useMessages(conversationId);
  const messages = useMemo(() => messagesQuery.data?.messages ?? [], [messagesQuery.data]);

  const sendMutation = useMutation({
    mutationFn: (content: string) => api.sendMessage(conversationId, content),
    onSuccess: async (message) => {
      /*
       * THE SENT MESSAGE APPEARS AT ONCE.
       *
       * The server's answer is written into the thread's cache entry before
       * anything else, so the reader's own message is on the screen the moment
       * it was sent. Waiting for the invalidation's refetch to come back left
       * the message absent for the length of a round trip — and absent for
       * good if that refetch failed.
       */
      queryClient.setQueryData<MessagesListResponse>(
        messageKeys.thread(conversationId),
        (previous) => {
          if (!previous || !Array.isArray(previous.messages)) return previous;
          if (previous.messages.some((existing) => existing.id === message.id)) return previous;
          return { ...previous, messages: [...previous.messages, message] };
        },
      );
      setNewMessage("");
      setSentAnnouncement(strings.social.messageSentAnnouncement);
      await invalidate.messages(conversationId);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /**
   * The signed-in reader's id, from the session store.
   *
   * It used to parse `localStorage["hakawi_tokens"]` for a `userId` that is never written
   * there — the token blob holds only a refresh token, so this always returned "" and EVERY
   * bubble rendered as the other person's. The session store reads the `hakawi_user` entry
   * `setStoredUser` writes on sign-in, the same source `stories/[id]` and `books/[id]` use,
   * so "is this mine" answers consistently.
   *
   * And it is read through the store rather than out of local storage during render: the
   * server has no local storage, so the id it would read there is not the reader's, and
   * React does not merge the two markups. See `lib/use-stored-user.ts`.
   */
  const currentUserId = useStoredUser()?.id ?? "";

  if (messagesQuery.isLoading) {
    return (
      <>
        <PageHeader title={strings.social.conversationTitle} />
        <p role="status" className="sr-only">
          {strings.common.loading}
        </p>
        <Card>
          <CardBody className="space-y-4">
            <Skeleton className="ms-auto h-14 w-2/3" rounded="rounded-2xl" />
            <Skeleton className="h-14 w-2/3" rounded="rounded-2xl" />
            <Skeleton className="ms-auto h-14 w-1/2" rounded="rounded-2xl" />
          </CardBody>
        </Card>
      </>
    );
  }

  if (isFailedLoad(messagesQuery)) {
    return (
      <ErrorMessage
        error={strings.errors[classifyError(messagesQuery.error)]}
        title={strings.social.conversationLoadFailed}
        onRetry={() => void messagesQuery.refetch()}
      />
    );
  }

  return (
    <div className="animate-rise">
      <Link
        href="/messages"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-chrome-ink hover:text-chrome"
      >
        <Icon name="chevron" size="sm" />
        {strings.social.conversationBack}
      </Link>

      <PageHeader title={strings.social.conversationTitle} />

      <Card className="flex h-[calc(100dvh-14rem)] max-h-[calc(100dvh-12rem)] flex-col overflow-hidden sm:h-[70dvh] sm:max-h-none">
        <CardBody className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <EmptyState
              icon="message"
              title={strings.social.conversationEmptyTitle}
              description={strings.social.conversationEmptyDescription}
              className="border-0 bg-transparent py-10"
            />
          ) : (
            <ol role="log" aria-live="polite" aria-label={strings.social.conversationLogLabel} className="space-y-3">
              {messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isOwn={message.senderId === currentUserId}
                  intl={intl}
                />
              ))}
            </ol>
          )}
          <div ref={messagesEndRef} />
        </CardBody>

        <div className="space-y-3 border-t border-line p-4">
          <p role="status" className="sr-only">
            {sentAnnouncement}
          </p>

          {sendMutation.isError && (
            <ErrorMessage
              error={strings.errors[classifyError(sendMutation.error)]}
              title={strings.social.messageSendFailed}
            />
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newMessage.trim()) return;
              sendMutation.mutate(newMessage);
            }}
            className="flex items-end gap-2"
          >
            <Input
              label={strings.social.messageInputLabel}
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={strings.social.messageInputPlaceholder}
              wrapperClassName="flex-1"
            />
            <Button type="submit" loading={sendMutation.isPending}>
              {strings.social.messageSendButton}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
