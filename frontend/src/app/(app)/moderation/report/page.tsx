"use client";

import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { useStrings } from "@/components/providers/LocaleProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { classifyError } from "@/lib/errors";
import { useInvalidation } from "@/lib/queries";

/**
 * The report-filing form.
 *
 * WHY THIS PAGE EXISTS. The product's proactive-defence model (principle #15) puts
 * the first line of protection in the hands of the community, not only in automated
 * rules. A reader who sees a rule-breaking story, comment or user needs a first-class
 * path to surface it, with enough structured data that a moderator can act without
 * a follow-up conversation.
 *
 * WHY A SUCCESSFUL REPORT INVALIDATES THE MODERATION CACHE. The report that was
 * just filed is now in the moderator's queue, and the reporter's own screens read
 * the same fact — so the queue is refetched instead of being left to show a
 * report the server has already recorded.
 */
export default function ReportPage() {
  const strings = useStrings();
  const { notify } = useToast();
  const invalidate = useInvalidation();

  const [targetId, setTargetId] = useState("");
  const [targetType, setTargetType] = useState<"story" | "comment" | "user">("story");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");

  const reportMutation = useMutation({
    mutationFn: () =>
      api.createReport({
        targetId,
        targetType,
        reason,
        description: description || undefined,
      }),
    onSuccess: async () => {
      notify(strings.moderation.reportSubmitted, "success");
      setTargetId("");
      setReason("");
      setDescription("");
      await invalidate.moderation();
    },
  });

  return (
    <div>
      <PageHeader title={strings.moderation.reportPageTitle} description={strings.moderation.reportPageDescription} />

      <Card>
        <CardBody>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              reportMutation.mutate();
            }}
            className="space-y-5"
          >
            {reportMutation.isError && (
              <ErrorMessage
                error={strings.errors[classifyError(reportMutation.error)]}
                title={strings.moderation.reportFailed}
              />
            )}

            <Select
              label={strings.moderation.reportTargetTypeLabel}
              value={targetType}
              onChange={(e) => setTargetType(e.target.value as "story" | "comment" | "user")}
              options={[
                { value: "story", label: strings.moderation.reportTargetTypeStory },
                { value: "comment", label: strings.moderation.reportTargetTypeComment },
                { value: "user", label: strings.moderation.reportTargetTypeUser },
              ]}
            />

            <Input
              label={strings.moderation.reportTargetIdLabel}
              type="text"
              required
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder={strings.moderation.reportTargetIdPlaceholder}
              wrapperClassName="max-w-lg"
            />

            <Input
              label={strings.moderation.reportReasonLabel}
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={strings.moderation.reportReasonPlaceholder}
              wrapperClassName="max-w-lg"
            />

            <Textarea
              label={strings.moderation.reportDescriptionLabel}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={strings.moderation.reportDescriptionPlaceholder}
              wrapperClassName="max-w-lg"
            />

            <div className="flex flex-wrap gap-3">
              <Button type="submit" loading={reportMutation.isPending}>
                {strings.moderation.reportSubmitButton}
              </Button>
              <ButtonLink href="/" variant="ghost">
                {strings.moderation.reportCancelButton}
              </ButtonLink>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
