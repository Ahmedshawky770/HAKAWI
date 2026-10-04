"use client";

import React, { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import {
  ConversationListEmpty,
  ConversationListSkeleton,
  ConversationRow,
} from "@/components/social/ConversationRow";
import type { Conversation } from "@/types/api";

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api.getConversations();
      setConversations(data.conversations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تحميل المحادثات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fire-and-forget; the retry below calls this same `load`.
    async function initialLoad() {
      await load();
    }
    void initialLoad();
  }, [load]);

  const retry = () => {
    setLoading(true);
    setError("");
    void load();
  };

  if (loading) {
    return (
      <>
        <PageHeader title="الرسائل" />
        <p role="status" className="sr-only">
          جارٍ التحميل…
        </p>
        <ConversationListSkeleton />
      </>
    );
  }

  if (error) {
    return <ErrorMessage error={error} onRetry={retry} title="تعذّر تحميل المحادثات" />;
  }

  const unreadTotal = conversations.reduce((total, conversation) => total + conversation.unreadCount, 0);

  return (
    <div className="animate-rise">
      <PageHeader
        title="الرسائل"
        description={unreadTotal > 0 ? `لديك ${unreadTotal} رسالة غير مقروءة.` : undefined}
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