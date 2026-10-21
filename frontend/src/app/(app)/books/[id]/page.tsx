"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  DEFAULT_RENTAL_DURATION_DAYS,
  RENTAL_DURATION_DAYS,
  rentalPriceForDays,
  type RentalDurationDays,
} from "@hakawi/shared-types";

import { api } from "@/lib/api";
import { useViewerId } from "@/lib/use-stored-user";
import { classifyError } from "@/lib/errors";
import { formatBookPrice } from "@/components/books/BookCard";
import { formatRentalQuote, formatPrice } from "@/lib/money";
import { isFailedLoad, useBook, useInvalidation } from "@/lib/queries";
import { useToast } from "@/components/providers/ToastProvider";
import { useLocale, useStrings } from "@/components/providers/LocaleProvider";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon } from "@/components/ui/Icon";
import { Input, Select } from "@/components/ui/Input";
import { RemoteImage } from "@/components/ui/RemoteImage";
import { Loading } from "@/components/ui/Loading";
import { CheckoutDialog, type CheckoutMethod, type CheckoutSession } from "@/components/commerce/CheckoutDialog";

/**
 * What a rental of this length costs, from the same rate the backend charges.
 *
 * `rentalPriceForDays` is the shared rate and it is denominated in PIASTRES like
 * every other amount in the product (1 EGP = 100) — `formatRentalQuote` performs
 * the single division by 100 this product contains. Quoting from the shared
 * constant means the figure on screen and the figure in the payment cannot
 * disagree; and the amount is still re-derived server-side when the payment is
 * created, so this is a quote for the reader, not the authority. The checkout is
 * where the money is decided.
 */
function formatRentPrice(days: number, locale: "ar" | "en"): string {
  return formatRentalQuote(rentalPriceForDays(days), days, locale);
}

/**
 * The rental lengths a reader can pick, labelled in the reader's language.
 *
 * Rendered from the shared list rather than six hard-coded options, so the
 * lengths a reader can pick from and the lengths the API accepts cannot drift —
 * `RentalsService` validates against the same array.
 */
function rentalDurationOptions(t: (days: RentalDurationDays) => string) {
  return RENTAL_DURATION_DAYS.map((days) => ({
    value: String(days),
    label: t(days),
  }));
}

/**
 * The product page for one book: what it is, what it costs, and the two ways
 * of paying for it.
 *
 * BOTH MONEY PATHS RETURN A CHECKOUT, NOT A RECEIPT, so both send the reader to
 * the gateway and the entitlement only ever arrives with `payment.completed`. A
 * failure is reported twice, on purpose: inline on the card that carries the
 * action, where the reader is looking, and as a toast, because the action they
 * pressed may be several sections up the page.
 *
 * THE CHECKOUT IS A PANEL, NOT A TEXT FIELD. The page used to ask for a
 * "payment method identifier" — a gateway handle, typed free-hand — before a
 * purchase would start, and `handleRent` ignored it while `handlePurchase`
 * demanded it: two money paths on one page behaving differently, neither of
 * them understandable to the reader. The reader now picks "card" or "wallet",
 * and the panel takes it from there.
 *
 * THE DELETE IS TWO-STEP, like the story's. A single button that removes a
 * book forever, on a page that also has "archive" one button away, is one
 * mis-tap from an unrecoverable loss. The first click arms the control and says
 * what is about to happen; the second commits.
 */
export default function BookDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const strings = useStrings();
  const { locale } = useLocale();
  const { notify } = useToast();
  const invalidate = useInvalidation();

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [rentalDays, setRentalDays] = useState<number>(DEFAULT_RENTAL_DURATION_DAYS);
  const [isbn, setIsbn] = useState("");
  const [isbnError, setIsbnError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);

  /** Which money path the checkout panel was opened for. */
  const [checkoutKind, setCheckoutKind] = useState<"purchase" | "rental" | null>(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [session, setSession] = useState<CheckoutSession | null>(null);

  const bookQuery = useBook(id);
  const book = bookQuery.data ?? null;

  const currentUserId = useViewerId();
  // Ownership is an id equality, not a display-name comparison. `book.author` is a human-readable
  // string (Principle: an id is the only thing that identifies an account, `docs/03_ids_as_strings.md`);
  // comparing it to the signed-in user's id never matched, so publish/archive/delete stayed dead for
  // every owner. `ownerId` is the account id surfaced by the books response (migration 0021/0028).
  const isOwner = currentUserId != null && book != null && book.ownerId === currentUserId;

  const reportFailure = (message: string) => {
    setActionError(message);
    notify(message, "error");
  };

  const closeCheckout = () => {
    setCheckoutKind(null);
    setSession(null);
    setCheckoutError("");
  };

  /**
   * Start the payment.
   *
   * WHAT TRAVELS TO THE API IS THE READER'S CHOICE, NOT AN IDENTIFIER. What goes
   * into the request is "card" or "wallet" — the two words the reader picked —
   * and the SERVER resolves them to this merchant's own Paymob method id. The
   * reader never sees a gateway handle, and the payment record says which
   * instrument was chosen without pretending to know the gateway's numbering.
   *
   * A deployment that has NOT configured a method id is a normal case, not an
   * error: the gateway then asks the customer which instrument to use inside
   * the payment frame, exactly as it did before the choice existed. So the
   * choice is honoured wherever the gateway can honour it, and never blocks a
   * purchase.
   *
   * The response is a CHECKOUT, not a receipt: the panel opens the gateway, and
   * the entitlement arrives later, on the webhook.
   */
  const startCheckout = async (method: CheckoutMethod) => {
    if (!book) return;
    setCheckoutPending(true);
    setCheckoutError("");
    try {
      const checkout =
        checkoutKind === "rental"
          ? await api.rentBook(book.id, { durationDays: rentalDays, paymentMethod: method })
          : await api.purchaseBook(book.id, method);

      setSession({ checkoutUrl: checkout.checkoutUrl, acceptUrl: checkout.acceptUrl });
      // The PAYMENT is the fact that changed — it exists from this moment, even
      // though the entitlement only arrives with the webhook. The book itself
      // is not touched yet, so its cache entry is left alone.
      invalidate.payments();
    } catch (err) {
      const message = strings.errors[classifyError(err)];
      setCheckoutError(message);
      notify(message, "error");
    } finally {
      setCheckoutPending(false);
    }
  };

  const handleClaimFree = async () => {
    if (!book) return;
    setActionLoading(true);
    setActionError("");
    try {
      await api.claimLibraryItem({ bookId: id });
      notify(strings.books.claimFreeSucceeded, "success");
      invalidate.library();
    } catch (err) {
      reportFailure(strings.errors[classifyError(err)]);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePublish = async () => {
    setActionLoading(true);
    setActionError("");
    try {
      await api.publishBook(id);
      notify(strings.books.publishSucceeded, "success");
      invalidate.books(id);
    } catch (err) {
      reportFailure(strings.errors[classifyError(err)]);
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchive = async () => {
    setActionLoading(true);
    setActionError("");
    try {
      await api.archiveBook(id);
      notify(strings.books.archiveSucceeded, "success");
      invalidate.books(id);
    } catch (err) {
      reportFailure(strings.errors[classifyError(err)]);
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Delete the book — the second step of a two-step control.
   *
   * The first click arms the button; this function is the second. Nothing is
   * deleted until the reader has been shown what is about to happen and asked
   * to confirm it.
   */
  const handleDelete = async () => {
    setActionLoading(true);
    setActionError("");
    try {
      await api.deleteBook(id);
      notify(strings.books.deleteSucceeded, "success");
      invalidate.books(id);
      router.push("/books");
    } catch (err) {
      reportFailure(strings.errors[classifyError(err)]);
      setDeleteArmed(false);
    } finally {
      setActionLoading(false);
    }
  };

  const handleIsbnLookup = async () => {
    if (!isbn) {
      setIsbnError(strings.books.isbnRequired);
      return;
    }
    setActionLoading(true);
    setActionError("");
    try {
      const data = await api.findBookByIsbn(isbn);
      router.push(`/books/${data.id}`);
      notify(strings.books.isbnLookupSucceeded, "success");
    } catch (err) {
      reportFailure(strings.errors[classifyError(err)]);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    setActionError("");
    try {
      const { downloadUrl } = await api.downloadBook(id);
      if (downloadUrl) {
        window.location.assign(downloadUrl);
      }
    } catch (err) {
      reportFailure(strings.errors[classifyError(err)]);
      setDownloading(false);
    }
  };

  if (bookQuery.isLoading) return <Loading />;

  if (isFailedLoad(bookQuery)) {
    return (
      <div className="space-y-4">
        <ErrorMessage
          error={strings.errors[classifyError(bookQuery.error)]}
          title={strings.books.loadFailedTitle}
          onRetry={() => void bookQuery.refetch()}
        />
        <ButtonLink href="/books" variant="ghost" size="sm">
          <Icon name="chevron" size="sm" />
          {strings.books.backToBooks}
        </ButtonLink>
      </div>
    );
  }

  if (!book) {
    return (
      <EmptyState
        icon="book"
        title={strings.books.notFoundTitle}
        description={strings.books.notFoundDescription}
        action={<ButtonLink href="/books">{strings.books.listTitle}</ButtonLink>}
      />
    );
  }

  const rentalPrice = rentalPriceForDays(rentalDays);
  const checkoutTitle =
    checkoutKind === "rental" ? strings.checkout.rentalTitle : strings.checkout.purchaseTitle;
  const checkoutAmount =
    checkoutKind === "rental"
      ? formatPrice(rentalPrice)
      : formatPrice(book.price ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={book.title}
        description={strings.books.byAuthor(book.author)}
        action={
          <ButtonLink href="/books" variant="ghost" size="sm">
            <Icon name="chevron" size="sm" />
            {strings.books.backToBooks}
          </ButtonLink>
        }
      />

      <Card>
        <CardBody>
          <div className="flex flex-col gap-6 sm:flex-row">
            {book.coverImage ? (
              <RemoteImage
                src={book.coverImage}
                alt={book.title}
                className="h-56 w-40 shrink-0 self-start rounded-lg object-cover"
              />
            ) : (
              <div className="grid h-56 w-40 shrink-0 place-items-center self-start rounded-lg bg-surface-raised text-ink-faint">
                <Icon name="library" size="lg" />
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-3">
              {book.price != null && book.price > 0 && (
                <p className="hk-numeric text-2xl font-bold text-accent-ink">{formatBookPrice(book.price)}</p>
              )}

              {book.pageCount != null && (
                <p className="flex items-center gap-2 text-sm text-ink-muted">
                  <Icon name="book" size="sm" />
                  {strings.books.pageCountLabel}: <span className="hk-numeric">{book.pageCount}</span>
                </p>
              )}

              <h2 className="pt-1 text-lg font-semibold text-ink">{strings.books.aboutHeading}</h2>
              {book.description ? (
                <p className="whitespace-pre-line leading-8 text-ink-muted">{book.description}</p>
              ) : (
                <p className="text-sm text-ink-muted">{strings.books.noDescription}</p>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-ink">{strings.books.buyOrRentHeading}</h2>
        </CardHeader>
        <CardBody>
          <div className="space-y-5">
            {actionError && <ErrorMessage error={actionError} title={strings.books.buyOrRentFailed} />}

            {book.isFree && (
              <Button onClick={handleClaimFree} loading={actionLoading} variant="secondary">
                {strings.books.claimFreeButton}
              </Button>
            )}

            {isOwner && (
              <div className="space-y-3 border-t border-line pt-5">
                <p className="text-sm font-medium text-ink-muted">{strings.books.ownerActionsHeading}</p>
                <div className="flex flex-wrap gap-3">
                  {book.status !== "published" && (
                    <Button onClick={handlePublish} loading={actionLoading} variant="secondary">
                      {strings.books.publishButton}
                    </Button>
                  )}
                  {book.status !== "archived" && (
                    <Button onClick={handleArchive} loading={actionLoading} variant="ghost">
                      {strings.books.archiveButton}
                    </Button>
                  )}
                  <Button
                    onClick={() => (deleteArmed ? void handleDelete() : setDeleteArmed(true))}
                    loading={actionLoading}
                    variant={deleteArmed ? "danger" : "ghost"}
                  >
                    <Icon name="trash" size="sm" />
                    {deleteArmed ? strings.books.deleteConfirmButton : strings.books.deleteButton}
                  </Button>
                  {deleteArmed && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteArmed(false)}>
                        {strings.books.deleteCancelButton}
                      </Button>
                      <p role="alert" className="w-full text-sm text-error-ink">
                        {strings.books.deleteWarning}
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="border-t border-line pt-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <Select
                  label={strings.books.rentalDurationLabel}
                  value={String(rentalDays)}
                  onChange={(event) => setRentalDays(Number(event.target.value))}
                  options={rentalDurationOptions(
                    (days) => strings.books.rentalDurationLabels[days] ?? `${days}`,
                  )}
                  wrapperClassName="sm:w-48"
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCheckoutKind("rental");
                    setSession(null);
                    setCheckoutError("");
                  }}
                >
                  {strings.books.rentButton}
                </Button>
              </div>
              <p className="hk-numeric mt-3 text-sm text-ink-muted">{formatRentPrice(rentalDays, locale)}</p>
            </div>

            {!book.isFree && (
              <div className="border-t border-line pt-5">
                <Button
                  onClick={() => {
                    setCheckoutKind("purchase");
                    setSession(null);
                    setCheckoutError("");
                  }}
                >
                  {strings.books.purchaseButton}
                </Button>
              </div>
            )}

            <div className="border-t border-line pt-5 space-y-3">
              <p className="text-sm font-medium text-ink-muted">{strings.books.isbnHeading}</p>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <Input
                  label={strings.books.isbnLabel}
                  type="text"
                  value={isbn}
                  onChange={(event) => {
                    setIsbn(event.target.value);
                    if (isbnError) setIsbnError("");
                  }}
                  placeholder={strings.books.isbnPlaceholder}
                  error={isbnError}
                  wrapperClassName="sm:max-w-sm"
                />
                <Button variant="secondary" onClick={handleIsbnLookup} loading={actionLoading}>
                  {strings.books.isbnLookupButton}
                </Button>
              </div>
            </div>

            <div className="border-t border-line pt-5">
              <Button variant="secondary" onClick={handleDownload} loading={downloading}>
                {strings.books.downloadButton}
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <CheckoutDialog
        open={checkoutKind !== null}
        title={checkoutTitle}
        amount={checkoutAmount}
        pending={checkoutPending}
        error={checkoutError}
        session={session}
        onConfirm={(method) => void startCheckout(method)}
        onClose={closeCheckout}
      />
    </div>
  );
}
