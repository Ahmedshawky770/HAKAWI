"use client";

import React, { useState } from "react";

import { api } from "@/lib/api";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/providers/ToastProvider";

/**
 * The report-filing form.
 *
 * WHY THIS PAGE EXISTS. The product's proactive-defence model (principle #15) puts
 * the first line of protection in the hands of the community, not only in automated
 * rules. A reader who sees a rule-breaking story, comment or user needs a first-class
 * path to surface it, with enough structured data that a moderator can act without
 * a follow-up conversation.
 */
export default function ReportPage() {
  const [targetId, setTargetId] = useState("");
  const [targetType, setTargetType] = useState<"story" | "comment" | "user">("story");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { notify } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.createReport({
        targetId,
        targetType,
        reason,
        description: description || undefined,
      });
      notify("تم إرسال التقرير بنجاح", "success");
      setTargetId("");
      setReason("");
      setDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل إرسال التقرير");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="إبلاغ عن محتوى" description="ساعدنا في الحفاظ على بيئة آمنة من خلال الإبلاغ عن المحتوى المخالف." />

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <ErrorMessage error={error} title="تعذّر إرسال التقرير" />}

            <Select
              label="نوع الهدف"
              value={targetType}
              onChange={(e) => setTargetType(e.target.value as "story" | "comment" | "user")}
              options={[
                { value: "story", label: "قصة" },
                { value: "comment", label: "تعليق" },
                { value: "user", label: "مستخدم" },
              ]}
            />

            <Input
              label="معرّف الهدف"
              type="text"
              required
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder="معرّف القصة أو التعليق أو المستخدم"
              wrapperClassName="max-w-lg"
            />

            <Input
              label="السبب"
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: محتوى مسيء"
              wrapperClassName="max-w-lg"
            />

            <Textarea
              label="وصف إضافي"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="أضف أي تفاصيل تساعد فريق الاعتدال على فهم الحالة."
              wrapperClassName="max-w-lg"
            />

            <div className="flex flex-wrap gap-3">
              <Button type="submit" loading={loading}>
                إرسال التقرير
              </Button>
              <ButtonLink href="/" variant="ghost">
                إلغاء
              </ButtonLink>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
