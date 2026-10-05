"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Input, Textarea } from "@/components/ui/Input";

/**
 * The create-book form.
 *
 * WHY THIS FORM EXISTS. The product needs a first-class path for publishers to enter a
 * book into the catalogue with all the metadata the commerce flow requires. The form
 * collects the shared fields first, then the optional ones, so the required path is
 * the shortest path and the optional path is clearly marked.
 *
 * The ISBN field is separate from the ISBN lookup on the detail page: a publisher
 * entering a new book may not have an ISBN yet, while a reader looking up an existing
 * one always does.
 */
export default function CreateBookPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [isbn, setIsbn] = useState("");
  const [publisher, setPublisher] = useState("");
  const [publishDate, setPublishDate] = useState("");
  const [language, setLanguage] = useState("");
  const [pageCount, setPageCount] = useState("");
  const [price, setPrice] = useState("");
  const [isFree, setIsFree] = useState(false);
  const [coverImage, setCoverImage] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileType, setFileType] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await api.createBook({
        title,
        author,
        description: description || undefined,
        isbn: isbn || undefined,
        publisher: publisher || undefined,
        publishDate: publishDate || undefined,
        language: language || undefined,
        pageCount: pageCount ? Number(pageCount) : undefined,
        price: price ? Number(price) : undefined,
        isFree,
        coverImage: coverImage || undefined,
        fileUrl: fileUrl || undefined,
        fileType: fileType || undefined,
        categoryId: categoryId || undefined,
      });
      router.push(`/books/${response.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل إنشاء الكتاب");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader title="إنشاء كتاب" description="أضف كتاباً جديداً إلى كتالوج حكاوي." />

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <ErrorMessage error={error} title="تعذّر إنشاء الكتاب" />}

            <Input
              label="عنوان الكتاب"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="أدخل عنوان الكتاب"
              wrapperClassName="max-w-lg"
            />

            <Input
              label="المؤلف"
              type="text"
              required
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="اسم المؤلف"
              wrapperClassName="max-w-lg"
            />

            <Textarea
              label="الوصف"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="وصف مختصر للكتاب"
              wrapperClassName="max-w-lg"
            />

            <Input
              label="ISBN"
              type="text"
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
              placeholder="978-3-16-148410-0"
              wrapperClassName="max-w-lg"
            />

            <Input
              label="الناشر"
              type="text"
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
              placeholder="اسم الناشر"
              wrapperClassName="max-w-lg"
            />

            <Input
              label="تاريخ النشر"
              type="date"
              value={publishDate}
              onChange={(e) => setPublishDate(e.target.value)}
              wrapperClassName="max-w-lg"
            />

            <Input
              label="اللغة"
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="العربية"
              wrapperClassName="max-w-lg"
            />

            <Input
              label="عدد الصفحات"
              type="number"
              min={1}
              value={pageCount}
              onChange={(e) => setPageCount(e.target.value)}
              placeholder="200"
              wrapperClassName="max-w-lg"
            />

            <Input
              label="السعر (بالقرش)"
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="2500"
              hint="أدخل السعر بالقرش (1 جنيه = 100 قرش). اتركه فارغاً إذا كان الكتاب مجانياً."
              wrapperClassName="max-w-lg"
            />

            <div className="flex items-center gap-2">
              <input
                id="isFree"
                type="checkbox"
                checked={isFree}
                onChange={(e) => setIsFree(e.target.checked)}
                className="h-4 w-4 rounded border-line accent-ink"
              />
              <label htmlFor="isFree" className="text-sm text-ink-muted">
                كتاب مجاني
              </label>
            </div>

            <Input
              label="رابط الغلاف"
              type="url"
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              placeholder="https://..."
              wrapperClassName="max-w-lg"
            />

            <Input
              label="رابط الملف"
              type="url"
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              placeholder="https://..."
              wrapperClassName="max-w-lg"
            />

            <Input
              label="نوع الملف"
              type="text"
              value={fileType}
              onChange={(e) => setFileType(e.target.value)}
              placeholder="pdf"
              wrapperClassName="max-w-lg"
            />

            <Input
              label="معرّف التصنيف"
              type="text"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              placeholder="category-1"
              wrapperClassName="max-w-lg"
            />

            <div className="flex flex-wrap gap-3">
              <Button type="submit" loading={loading}>
                إنشاء الكتاب
              </Button>
              <ButtonLink href="/books" variant="ghost">
                إلغاء
              </ButtonLink>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
