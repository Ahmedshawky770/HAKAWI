"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Card, CardBody } from "@/components/ui/Card";

const STEPS = [
  "Account",
  "Company",
  "Legal",
  "Representative",
  "Contact",
  "Profile",
  "Documents",
  "Banking",
  "Agreements",
] as const;

type FormData = Record<string, string | boolean | number>;

export default function PublisherApplyPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormData>({
    email: "",
    password: "",
    confirmPassword: "",
    registrantName: "",
    registrantPhone: "",
    registrantRole: "legal_rep",
    companyName: "",
    tradingName: "",
    nameEn: "",
    entityType: "company",
    country: "Egypt",
    province: "",
    city: "",
    address: "",
    logoUrl: "",
    website: "",
    socialLinks: "",
    crNumber: "",
    crIssuer: "",
    crExpiry: "",
    activityType: "publishing_distribution",
    taxNumber: "",
    vatRegistered: false,
    isbnPrefix: "",
    legalRepName: "",
    legalRepNationalId: "",
    legalRepTitle: "",
    legalRepPhone: "",
    officialEmail: "",
    phone: "",
    whatsapp: "",
    supportEmail: "",
    bio: "",
    publishingFields: "",
    foundedYear: "",
    titleCount: "",
    crImageUrl: "",
    taxCardImageUrl: "",
    idCardFrontUrl: "",
    idCardBackUrl: "",
    authorizationLetterUrl: "",
    delegateIdCardUrl: "",
    depositCertificateUrl: "",
    bankAccountName: "",
    bankName: "",
    iban: "",
    swiftCode: "",
    termsAccepted: false,
    privacyAccepted: false,
    dataAccuracyAccepted: false,
    copyrightAccepted: false,
  });

  const set = (k: string, v: string | boolean | number) => setForm((f) => ({ ...f, [k]: v }));

  const handleFileUpload = async (field: string, file: File) => {
    setUploadingField(field);
    try {
      const ticket = await api.uploadFile(file);
      set(field, ticket.cdnUrl ?? ticket.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadingField(null);
    }
  };

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    try {
      await api.submitPublisherApplication({
        companyName: String(form.companyName),
        companyWebsite: form.website ? String(form.website) : undefined,
        companyAddress: String(form.address),
        taxId: String(form.taxNumber),
        contactName: String(form.registrantName),
        contactEmail: String(form.officialEmail || form.email),
        contactPhone: form.phone ? String(form.phone) : undefined,
        description: String(form.bio || "Publisher application"),
        registrantName: String(form.registrantName),
        registrantPhone: String(form.registrantPhone),
        registrantRole: String(form.registrantRole),
        tradingName: form.tradingName ? String(form.tradingName) : undefined,
        nameEn: form.nameEn ? String(form.nameEn) : undefined,
        entityType: String(form.entityType),
        province: String(form.province),
        city: String(form.city),
        logoUrl: form.logoUrl ? String(form.logoUrl) : undefined,
        website: form.website ? String(form.website) : undefined,
        socialLinks: form.socialLinks ? String(form.socialLinks) : undefined,
        crIssuer: String(form.crIssuer),
        crExpiry: form.crExpiry ? new Date(String(form.crExpiry)) : undefined,
        activityType: String(form.activityType),
        vatRegistered: Boolean(form.vatRegistered),
        isbnPrefix: form.isbnPrefix ? String(form.isbnPrefix) : undefined,
        legalRepName: String(form.legalRepName),
        legalRepNationalId: String(form.legalRepNationalId),
        legalRepTitle: String(form.legalRepTitle),
        legalRepPhone: String(form.legalRepPhone),
        officialEmail: String(form.officialEmail),
        phone: String(form.phone),
        whatsapp: form.whatsapp ? String(form.whatsapp) : undefined,
        supportEmail: form.supportEmail ? String(form.supportEmail) : undefined,
        bio: String(form.bio),
        publishingFields: form.publishingFields ? String(form.publishingFields) : undefined,
        foundedYear: form.foundedYear ? Number(form.foundedYear) : undefined,
        titleCount: form.titleCount ? Number(form.titleCount) : undefined,
        crImageUrl: form.crImageUrl ? String(form.crImageUrl) : undefined,
        taxCardImageUrl: form.taxCardImageUrl ? String(form.taxCardImageUrl) : undefined,
        idCardFrontUrl: form.idCardFrontUrl ? String(form.idCardFrontUrl) : undefined,
        idCardBackUrl: form.idCardBackUrl ? String(form.idCardBackUrl) : undefined,
        authorizationLetterUrl: form.authorizationLetterUrl ? String(form.authorizationLetterUrl) : undefined,
        delegateIdCardUrl: form.delegateIdCardUrl ? String(form.delegateIdCardUrl) : undefined,
        depositCertificateUrl: form.depositCertificateUrl ? String(form.depositCertificateUrl) : undefined,
        bankAccountName: form.bankAccountName ? String(form.bankAccountName) : undefined,
        bankName: form.bankName ? String(form.bankName) : undefined,
        iban: form.iban ? String(form.iban) : undefined,
        swiftCode: form.swiftCode ? String(form.swiftCode) : undefined,
        termsAccepted: Boolean(form.termsAccepted),
        privacyAccepted: Boolean(form.privacyAccepted),
        dataAccuracyAccepted: Boolean(form.dataAccuracyAccepted),
        copyrightAccepted: Boolean(form.copyrightAccepted),
      });
      queryClient.clear();
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-3">
            <Input label="Email" type="email" value={String(form.email)} onChange={(e) => set("email", e.target.value)} required />
            <Input label="Password" type="password" value={String(form.password)} onChange={(e) => set("password", e.target.value)} required />
            <Input label="Confirm password" type="password" value={String(form.confirmPassword)} onChange={(e) => set("confirmPassword", e.target.value)} required />
            <Input label="Registrant name" value={String(form.registrantName)} onChange={(e) => set("registrantName", e.target.value)} required />
            <Input label="Registrant phone" value={String(form.registrantPhone)} onChange={(e) => set("registrantPhone", e.target.value)} required />
            <div>
              <label className="mb-1 block text-sm font-medium">Registrant role</label>
              <select value={String(form.registrantRole)} onChange={(e) => set("registrantRole", e.target.value)} className="w-full rounded border border-line bg-surface p-2">
                <option value="legal_rep">Legal representative</option>
                <option value="delegate">Delegate</option>
              </select>
            </div>
          </div>
        );
      case 1:
        return (
          <div className="space-y-3">
            <Input label="Official company name" value={String(form.companyName)} onChange={(e) => set("companyName", e.target.value)} required />
            <Input label="Trading name" value={String(form.tradingName)} onChange={(e) => set("tradingName", e.target.value)} />
            <Input label="Name (English)" value={String(form.nameEn)} onChange={(e) => set("nameEn", e.target.value)} />
            <div>
              <label className="mb-1 block text-sm font-medium">Entity type</label>
              <select value={String(form.entityType)} onChange={(e) => set("entityType", e.target.value)} className="w-full rounded border border-line bg-surface p-2">
                <option value="company">Company</option>
                <option value="individual">Individual</option>
                <option value="association">Association</option>
                <option value="government">Government/Academic</option>
              </select>
            </div>
            <Input label="Country" value={String(form.country)} onChange={(e) => set("country", e.target.value)} required />
            <Input label="Province" value={String(form.province)} onChange={(e) => set("province", e.target.value)} required />
            <Input label="City" value={String(form.city)} onChange={(e) => set("city", e.target.value)} required />
            <Input label="Address" value={String(form.address)} onChange={(e) => set("address", e.target.value)} required />
            <div><label className="mb-1 block text-sm font-medium">Logo (PNG/JPG)</label><input type="file" accept="image/png,image/jpeg" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload("logoUrl", f); }} /><p className="text-xs text-ink-muted">{String(form.logoUrl)}</p>{uploadingField === "logoUrl" && <p className="text-xs">Uploading...</p>}</div>
            <Input label="Website" value={String(form.website)} onChange={(e) => set("website", e.target.value)} />
            <Input label="Social links" value={String(form.socialLinks)} onChange={(e) => set("socialLinks", e.target.value)} />
          </div>
        );
      case 2:
        return (
          <div className="space-y-3">
            <Input label="CR number" value={String(form.crNumber)} onChange={(e) => set("crNumber", e.target.value)} required />
            <Input label="CR issuer" value={String(form.crIssuer)} onChange={(e) => set("crIssuer", e.target.value)} required />
            <Input label="CR expiry" type="date" value={String(form.crExpiry)} onChange={(e) => set("crExpiry", e.target.value)} required />
            <Input label="Activity type" value={String(form.activityType)} onChange={(e) => set("activityType", e.target.value)} />
            <Input label="Tax number" value={String(form.taxNumber)} onChange={(e) => set("taxNumber", e.target.value)} required />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={Boolean(form.vatRegistered)} onChange={(e) => set("vatRegistered", e.target.checked)} />
              VAT registered
            </label>
            <Input label="ISBN prefix" value={String(form.isbnPrefix)} onChange={(e) => set("isbnPrefix", e.target.value)} />
          </div>
        );
      case 3:
        return (
          <div className="space-y-3">
            <Input label="Legal rep name" value={String(form.legalRepName)} onChange={(e) => set("legalRepName", e.target.value)} required />
            <Input label="National ID" value={String(form.legalRepNationalId)} onChange={(e) => set("legalRepNationalId", e.target.value)} required />
            <Input label="Title" value={String(form.legalRepTitle)} onChange={(e) => set("legalRepTitle", e.target.value)} required />
            <Input label="Phone" value={String(form.legalRepPhone)} onChange={(e) => set("legalRepPhone", e.target.value)} required />
          </div>
        );
      case 4:
        return (
          <div className="space-y-3">
            <Input label="Official email" type="email" value={String(form.officialEmail)} onChange={(e) => set("officialEmail", e.target.value)} required />
            <Input label="Phone" value={String(form.phone)} onChange={(e) => set("phone", e.target.value)} required />
            <Input label="WhatsApp" value={String(form.whatsapp)} onChange={(e) => set("whatsapp", e.target.value)} />
            <Input label="Support email" type="email" value={String(form.supportEmail)} onChange={(e) => set("supportEmail", e.target.value)} />
          </div>
        );
      case 5:
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Bio</label>
              <textarea name="bio" value={String(form.bio)} onChange={(e) => set("bio", e.target.value)} required rows={4} className="w-full rounded border border-line bg-surface p-2" />
            </div>
            <Input label="Publishing fields (comma separated)" value={String(form.publishingFields)} onChange={(e) => set("publishingFields", e.target.value)} required />
            <Input label="Founded year" type="number" value={String(form.foundedYear)} onChange={(e) => set("foundedYear", e.target.value)} />
            <Input label="Title count" type="number" value={String(form.titleCount)} onChange={(e) => set("titleCount", e.target.value)} />
          </div>
        );
      case 6:
        return (
          <div className="space-y-3">
            <div><label className="mb-1 block text-sm font-medium">CR image (JPG/PNG/PDF)</label><input type="file" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload("crImageUrl", f); }} /><p className="text-xs text-ink-muted">{String(form.crImageUrl)}</p>{uploadingField === "crImageUrl" && <p className="text-xs">Uploading...</p>}</div>
            <div><label className="mb-1 block text-sm font-medium">Tax card image</label><input type="file" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload("taxCardImageUrl", f); }} /><p className="text-xs text-ink-muted">{String(form.taxCardImageUrl)}</p>{uploadingField === "taxCardImageUrl" && <p className="text-xs">Uploading...</p>}</div>
            <div><label className="mb-1 block text-sm font-medium">ID card front</label><input type="file" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload("idCardFrontUrl", f); }} /><p className="text-xs text-ink-muted">{String(form.idCardFrontUrl)}</p>{uploadingField === "idCardFrontUrl" && <p className="text-xs">Uploading...</p>}</div>
            <div><label className="mb-1 block text-sm font-medium">ID card back</label><input type="file" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload("idCardBackUrl", f); }} /><p className="text-xs text-ink-muted">{String(form.idCardBackUrl)}</p>{uploadingField === "idCardBackUrl" && <p className="text-xs">Uploading...</p>}</div>
            <div><label className="mb-1 block text-sm font-medium">Authorization letter (if delegate)</label><input type="file" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload("authorizationLetterUrl", f); }} /><p className="text-xs text-ink-muted">{String(form.authorizationLetterUrl)}</p>{uploadingField === "authorizationLetterUrl" && <p className="text-xs">Uploading...</p>}</div>
            <div><label className="mb-1 block text-sm font-medium">Delegate ID card</label><input type="file" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload("delegateIdCardUrl", f); }} /><p className="text-xs text-ink-muted">{String(form.delegateIdCardUrl)}</p>{uploadingField === "delegateIdCardUrl" && <p className="text-xs">Uploading...</p>}</div>
            <div><label className="mb-1 block text-sm font-medium">Deposit certificate</label><input type="file" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload("depositCertificateUrl", f); }} /><p className="text-xs text-ink-muted">{String(form.depositCertificateUrl)}</p>{uploadingField === "depositCertificateUrl" && <p className="text-xs">Uploading...</p>}</div>
          </div>
        );
      case 7:
        return (
          <div className="space-y-3">
            <Input label="Bank account name" value={String(form.bankAccountName)} onChange={(e) => set("bankAccountName", e.target.value)} required />
            <Input label="Bank name" value={String(form.bankName)} onChange={(e) => set("bankName", e.target.value)} required />
            <Input label="IBAN" value={String(form.iban)} onChange={(e) => set("iban", e.target.value)} required />
            <Input label="SWIFT code" value={String(form.swiftCode)} onChange={(e) => set("swiftCode", e.target.value)} />
          </div>
        );
      case 8:
        return (
          <div className="space-y-3">
            <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(form.termsAccepted)} onChange={(e) => set("termsAccepted", e.target.checked)} /> Terms & publisher agreement</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(form.privacyAccepted)} onChange={(e) => set("privacyAccepted", e.target.checked)} /> Privacy policy</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(form.dataAccuracyAccepted)} onChange={(e) => set("dataAccuracyAccepted", e.target.checked)} /> Data accuracy</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={Boolean(form.copyrightAccepted)} onChange={(e) => set("copyrightAccepted", e.target.checked)} /> Copyright ownership</label>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-2 text-2xl font-bold">Publisher registration</h1>
      <p className="mb-4 text-ink-muted">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
      {error && <ErrorMessage error={error} />}
      <Card>
        <CardBody>{renderStep()}</CardBody>
      </Card>
      <div className="mt-4 flex justify-between">
        <Button variant="ghost" onClick={prev} disabled={step === 0}>Previous</Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={next}>Next</Button>
        ) : (
          <Button onClick={handleSubmit} loading={loading}>Submit application</Button>
        )}
      </div>
    </div>
  );
}
