"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { MessageBubble } from "@/components/social/MessageBubble";
import { useLocale } from "@/components/providers/LocaleProvider";
import type { Message } from "@/types/api";

export default function ConversationPage() {
  const params = useParams();
  const conversationId = typeof params.id === "string" ? params.id : "";
  const { intl } = useLocale();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sentAnnouncement, setSentAnnouncement] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getMessages(conversationId);
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تحميل الرسائل");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    // Fire-and-forget; the retry below calls this same `load`.
    async function initialLoad() {
      await load();
    }
    void initialLoad();
  }, [load]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setSending(true);
    setSendError("");
    try {
      const message = await api.sendMessage(conversationId, newMessage);
      setMessages([...messages, message]);
      setNewMessage("");
      setSentAnnouncement("تم إرسال رسالتك");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "تعذّر إرسال الرسالة");
    } finally {
      setSending(false);
    }
  };

  const getCurrentUserId = (): string => {
    if (typeof window === "undefined") return "";
    const tokens = localStorage.getItem("hakawi_tokens");
    if (!tokens) return "";
    try {
      return JSON.parse(tokens).userId || "";
    } catch {
      return "";
    }
  };

  const currentUserId = getCurrentUserId();

  if (loading) {
    return (
      <>
        <PageHeader title="المحادثة" />
        <p role="status" className="sr-only">
          جارٍ التحميل…
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

  if (error) {
    return (
      <ErrorMessage
        error={error}
        title="تعذّر تحميل الرسائل"
        onRetry={() => {
          setLoading(true);
          setError("");
          void load();
        }}
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
        العودة إلى الرسائل
      </Link>

      <PageHeader title="المحادثة" />

      <Card className="flex h-[70dvh] flex-col overflow-hidden">
        <CardBody className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <EmptyState
              icon="message"
              title="لا توجد رسائل بعد"
              description="اكتب أول رسالة في هذه المحادثة."
              className="border-0 bg-transparent py-10"
            />
          ) : (
            <ol role="log" aria-live="polite" aria-label="رسائل المحادثة" className="space-y-3">
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

          {sendError && <ErrorMessage error={sendError} title="تعذّر إرسال الرسالة" />}

          <form onSubmit={handleSend} className="flex items-end gap-2">
            <Input
              label="اكتب رسالتك"
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="اكتب رسالة…"
              wrapperClassName="flex-1"
            />
            <Button type="submit" loading={sending}>
              إرسال
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}