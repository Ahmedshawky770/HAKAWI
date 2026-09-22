"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Message } from "@/types/api";

export default function ConversationPage() {
  const params = useParams();
  const conversationId = typeof params.id === "string" ? params.id : "";
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getMessages(conversationId);
        setMessages(data.messages);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load messages");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      const message = await api.sendMessage(conversationId, newMessage);
      setMessages([...messages, message]);
      setNewMessage("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

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

  return (
    <div className="p-6 max-w-4xl mx-auto h-screen flex flex-col">
      <div className="mb-4">
        <Link href="/messages" className="text-blue-600 hover:text-blue-500">
          ← Back to messages
        </Link>
      </div>
      <Card className="flex-1 flex flex-col">
        <CardBody className="flex-1 overflow-y-auto">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.senderId === currentUserId ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg px-4 py-2 ${
                    message.senderId === currentUserId
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-900"
                  }`}
                >
                  <p>{message.content}</p>
                  <p className={`text-xs mt-1 ${message.senderId === currentUserId ? "text-blue-100" : "text-gray-500"}`}>
                    {new Date(message.createdAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </CardBody>
        <div className="border-t p-4">
          <form onSubmit={handleSend} className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1"
            />
            <Button type="submit" loading={sending}>
              Send
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
