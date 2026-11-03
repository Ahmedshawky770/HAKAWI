"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useStrings } from "@/components/providers/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Card, CardBody } from "@/components/ui/Card";
import { ONBOARDING_VIDEO_CONSTRAINTS, PROFESSIONAL_BIO_MIN, PROFESSIONAL_BIO_MAX, PHONE_REGEX } from "@/lib/constants/onboarding";

export default function ProfessionalApplyPage() {
  const strings = useStrings();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ birthDate: "", country: "", bio: "", phoneNumber: "" });
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoError, setVideoError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const validateVideo = (file: File): string => {
    const c = ONBOARDING_VIDEO_CONSTRAINTS;
    if (!c.allowedTypes.includes(file.type as any)) return "Invalid video format";
    if (file.size > c.maxSizeBytes) return "Video too large (max 15MB)";
    if (file.size < c.minSizeBytes) return "Video too small (min 500KB)";
    const age = Date.now() - file.lastModified;
    if (age > c.maxAgeMs) return "Video must be recorded within 24 hours";
    return "";
  };

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateVideo(file);
    setVideoError(err);
    if (!err) setVideoFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoFile) {
      setVideoError("Video is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("birthDate", form.birthDate);
      fd.append("country", form.country);
      fd.append("bio", form.bio);
      fd.append("phoneNumber", form.phoneNumber);
      fd.append("video", videoFile);
      await api.submitProfessionalApplication(fd);
      queryClient.clear();
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const bioLen = form.bio.length;
  const bioValid = bioLen >= PROFESSIONAL_BIO_MIN && bioLen <= PROFESSIONAL_BIO_MAX;
  const phoneValid = PHONE_REGEX.test(form.phoneNumber);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Professional application</h1>
      {error && <ErrorMessage error={error} />}
      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Birth date" name="birthDate" type="date" value={form.birthDate} onChange={handleChange} required />
            <Input label="Country" name="country" value={form.country} onChange={handleChange} required />
            <div>
              <label className="mb-1 block text-sm font-medium">Bio</label>
              <textarea
                name="bio"
                value={form.bio}
                onChange={handleChange}
                required
                rows={4}
                className="w-full rounded border border-line bg-surface p-2"
              />
              <p className={`text-xs ${bioValid ? "text-ink-muted" : "text-error"}`}>{bioLen}/{PROFESSIONAL_BIO_MAX}</p>
            </div>
            <Input label="Phone number" name="phoneNumber" value={form.phoneNumber} onChange={handleChange} required />
            {!phoneValid && form.phoneNumber && <p className="text-xs text-error">Invalid phone number</p>}
            <div>
              <label className="mb-1 block text-sm font-medium">Face verification video</label>
              <input ref={fileInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" onChange={handleVideoChange} />
              {videoError && <p className="text-xs text-error">{videoError}</p>}
              {videoFile && !videoError && <p className="text-xs text-success">{videoFile.name}</p>}
            </div>
            <Button type="submit" loading={loading} block disabled={!bioValid || !phoneValid || !videoFile}>
              Submit application
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
