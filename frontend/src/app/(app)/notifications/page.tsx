"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Notification } from "@/types/api";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getNotifications({ page: 1, limit: 20 });
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load notifications");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleMarkAsRead = async (id: string) => {
    try {
      await api.markNotificationAsRead(id);
      setNotifications(notifications.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      setUnreadCount(Math.max(0, unreadCount - 1));
    } catch {
      // ignore
    }
  };

  if (loading) return <Loading />;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
        {unreadCount > 0 && (
          <span className="text-sm text-gray-600">{unreadCount} unread</span>
        )}
      </div>
      {notifications.length === 0 ? (
        <p className="text-gray-600">No notifications yet.</p>
      ) : (
        <div className="space-y-4">
          {notifications.map((notification) => (
            <Card
              key={notification.id}
              className={`${!notification.isRead ? "border-blue-200 bg-blue-50" : ""}`}
            >
              <CardBody>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">{notification.title}</h3>
                    <p className="text-gray-700 mt-1">{notification.message}</p>
                    <p className="text-sm text-gray-500 mt-2">
                      {new Date(notification.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {!notification.isRead && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleMarkAsRead(notification.id)}
                    >
                      Mark as read
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
