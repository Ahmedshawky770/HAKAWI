"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useStrings } from "@/components/providers/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Card, CardBody } from "@/components/ui/Card";

export default function PublisherApplyPage() {
  const strings = useStrings();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    companyName: "",
    companyWebsite: "",
    contactName: "",
    contactEmail: "",
    description: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.submitPublisherApplication({
        companyName: form.companyName,
        companyWebsite: form.companyWebsite || undefined,
        contactName: form.contactName,
        contactEmail: form.contactEmail,
        description: form.description,
      });
      queryClient.clear();
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : strings.errors.unknown);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-bold">{strings.admin.verification.pageTitle}</h1>
      {error && <ErrorMessage error={error} />}
      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Company name" name="companyName" value={form.companyName} onChange={handleChange} required />
            <Input label="Website" name="companyWebsite" value={form.companyWebsite} onChange={handleChange} />
            <Input label="Contact name" name="contactName" value={form.contactName} onChange={handleChange} required />
            <Input label="Contact email" name="contactEmail" type="email" value={form.contactEmail} onChange={handleChange} required />
            <div>
              <label className="mb-1 block text-sm font-medium">Description</label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                required
                rows={4}
                className="w-full rounded border border-line bg-surface p-2"
              />
            </div>
            <Button type="submit" loading={loading} block>
              Submit application
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
