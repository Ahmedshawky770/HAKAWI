"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { classifyError } from "@/lib/errors";
import { useInvalidation } from "@/lib/queries";
import { useStrings } from "@/components/providers/LocaleProvider";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, PageHeader } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Input, Textarea } from "@/components/ui/Input";
import { RequireAccount } from "@/components/account/RequireAccount";

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
 *
 * THE PRICE IS IN PIASTRES, AND THE FORM SAYS SO. `books.price` is the integer the
 * gateway is asked to charge — 2500 is 25.00 EGP — and a publisher who types
 * "25" into the field would be publishing a book at a hundredth of the price they
 * meant. The hint is therefore explicit rather than implied, and the same sentence
 * exists in both languages.
 */
export default function CreateBookPage() {
  const router = useRouter();
  const strings = useStrings();
  const invalidate = useInvalidation();
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
      // The catalogue is a shared fact: the new book is in it the moment it
      // exists, so the cache is told rather than left to a manual refresh.
      invalidate.books(response.id);
      router.push(`/books/${response.id}`);
    } catch (err) {
      setError(strings.errors[classifyError(err)]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <RequireAccount capability="sellBooks" upgradeRoute="/profile">
      <div>
        <PageHeader title={strings.books.createTitle} description={strings.books.createDescription} />

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <ErrorMessage error={error} title={strings.books.createFailed} />}

            <Input
              label={strings.books.titleLabel}
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={strings.books.titlePlaceholder}
              wrapperClassName="max-w-lg"
            />

            <Input
              label={strings.books.authorLabel}
              type="text"
              required
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder={strings.books.authorPlaceholder}
              wrapperClassName="max-w-lg"
            />

            <Textarea
              label={strings.books.descriptionLabel}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={strings.books.descriptionPlaceholder}
              wrapperClassName="max-w-lg"
            />

            <Input
              label={strings.books.isbnFieldLabel}
              type="text"
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
              placeholder={strings.books.isbnPlaceholder}
              wrapperClassName="max-w-lg"
            />

            <Input
              label={strings.books.publisherLabel}
              type="text"
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
              placeholder={strings.books.publisherLabel}
              wrapperClassName="max-w-lg"
            />

            <Input
              label={strings.books.publishDateLabel}
              type="date"
              value={publishDate}
              onChange={(e) => setPublishDate(e.target.value)}
              wrapperClassName="max-w-lg"
            />

            <Input
              label={strings.books.languageLabel}
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder={strings.books.languagePlaceholder}
              wrapperClassName="max-w-lg"
            />

            <Input
              label={strings.books.pageCountFieldLabel}
              type="number"
              min={1}
              value={pageCount}
              onChange={(e) => setPageCount(e.target.value)}
              placeholder="200"
              wrapperClassName="max-w-lg"
            />

            <Input
              label={strings.books.priceLabel}
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="2500"
              hint={strings.books.priceHint}
              wrapperClassName="max-w-lg"
            />

            <div className="flex items-center gap-2">
              <input
                id="isFree"
                type="checkbox"
                checked={isFree}
                onChange={(e) => setIsFree(e.target.checked)}
                className="size-5 rounded border-control-line accent-accent-fill"
              />
              <label htmlFor="isFree" className="text-sm text-ink-muted">
                {strings.books.freeLabel}
              </label>
            </div>

            <Input
              label={strings.books.coverLabel}
              type="url"
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              placeholder={strings.books.coverPlaceholder}
              wrapperClassName="max-w-lg"
            />

            <Input
              label={strings.books.fileLabel}
              type="url"
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              placeholder={strings.books.fileHint}
              wrapperClassName="max-w-lg"
            />

            <Input
              label={strings.books.fileTypeLabel}
              type="text"
              value={fileType}
              onChange={(e) => setFileType(e.target.value)}
              placeholder={strings.books.fileTypePlaceholder}
              wrapperClassName="max-w-lg"
            />

            <Input
              label={strings.books.categoryLabel}
              type="text"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              placeholder="category-1"
              wrapperClassName="max-w-lg"
            />

            <div className="flex flex-wrap gap-3">
              <Button type="submit" loading={loading}>
                {strings.books.createSubmitButton}
              </Button>
              <ButtonLink href="/books" variant="ghost">
                {strings.books.cancelButton}
              </ButtonLink>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
    </RequireAccount>
  );
}
