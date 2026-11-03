"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useStoredUser } from "@/lib/use-stored-user";
import { setStoredUser, getStoredUser } from "@/lib/api";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";

type Choice = "reader" | "rising_star" | "professional";

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useStoredUser();
  const { locale } = useLocale();
  const isAr = locale === "ar";
  const [choice, setChoice] = useState<Choice>("reader");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!user) {
    if (typeof window !== "undefined") router.replace("/login");
    return null;
  }

  const t = (ar: string, en: string) => (isAr ? ar : en);

  const handleContinue = async () => {
    setLoading(true);
    setError("");
    try {
      if (choice === "rising_star") {
        await api.upgradeAccount("rising_star");
      } else if (choice === "professional") {
        await api.upgradeAccount("professional");
      }
      await api.updateMe({ onboardingCompleted: true });
      const stored = getStoredUser();
      if (stored) {
        setStoredUser({ ...stored, onboardingCompleted: true });
      }
      queryClient.clear();
      router.push("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("فشل", "Failed"));
    } finally {
      setLoading(false);
    }
  };

  const options: { value: Choice; title: string; desc: string }[] = [
    { value: "reader", title: t("قارئ", "Reader"), desc: t("اقرأ القصص وتفاعل معها.", "Read and react to stories.") },
    { value: "rising_star", title: t("كاتب ناشئ", "Rising Star"), desc: t("اكتب قصصك وشاركها.", "Write and share your stories.") },
    { value: "professional", title: t("كاتب محترف", "Professional"), desc: t("بيع كتبك (يتطلب موافقة).", "Sell your books (requires approval).") },
  ];

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-2 text-2xl font-bold">{t("اختر نوع حسابك", "Choose your account type")}</h1>
      <p className="mb-6 text-ink-muted">{t("يمكنك الترقية لاحقًا من صفحتك.", "You can upgrade later from your profile.")}</p>
      <div className="space-y-3">
        {options.map((o) => (
          <Card key={o.value} className={choice === o.value ? "border-primary-fill" : ""}>
            <CardBody>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="accountType"
                  value={o.value}
                  checked={choice === o.value}
                  onChange={() => setChoice(o.value)}
                  className="mt-1"
                />
                <div>
                  <div className="font-semibold">{o.title}</div>
                  <div className="text-sm text-ink-muted">{o.desc}</div>
                </div>
              </label>
            </CardBody>
          </Card>
        ))}
      </div>
      {error && <p className="mt-3 text-error">{error}</p>}
      <Button className="mt-6" onClick={handleContinue} loading={loading} block>
        {t("متابعة", "Continue")}
      </Button>
    </div>
  );
}
