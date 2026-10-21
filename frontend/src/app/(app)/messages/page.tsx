"use client";

import React from "react";

import { PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import {
  ConversationListEmpty,
  ConversationListSkeleton,
  ConversationRow,
} from "@/components/social/ConversationRow";
import { useStrings } from "@/components/providers/LocaleProvider";
import { classifyError } from "@/lib/errors";
import { isFailedLoad, useConversations, useUnreadMessageCount } from "@/lib/queries";

export default function MessagesPage() {
  const strings = useStrings();
  const conversationsQuery = useConversations();
  const { data, isLoading, error, refetch } = conversationsQuery;
  /*
   * THE UNREAD TOTAL IS DERIVED ONCE.
   *
   * The registry already owns this fact: `useUnreadMessageCount` sums the same
   * conversations and feeds the sidebar badge and the bottom-navigation badge.
   * The page kept its own sum, so the badge and the sentence under the heading
   * were two answers to one question — and they could disagree, because one of
   * them guarded its sum with `?? 0` and the other did not.
   */
  const unreadTotal = useUnreadMessageCount();

  if (isLoading) {
    return (
      <>
        <PageHeader title={strings.social.messagesTitle} />
        <p role="status" className="sr-only">
          {strings.common.loading}
        </p>
        <ConversationListSkeleton />
      </>
    );
  }

  if (isFailedLoad(conversationsQuery)) {
    return (
      <ErrorMessage
        error={strings.errors[classifyError(error)]}
        title={strings.social.messagesLoadFailed}
        onRetry={() => void refetch()}
      />
    );
  }

  const conversations = data?.conversations ?? [];

  return (
    <div className="animate-rise">
      <PageHeader
        title={strings.social.messagesTitle}
        description={
          unreadTotal > 0 ? strings.social.messagesUnreadDescription(unreadTotal) : undefined
        }
      />

      {conversations.length === 0 ? (
        <ConversationListEmpty />
      ) : (
        <ul className="space-y-4">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <ConversationRow conversation={conversation} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
