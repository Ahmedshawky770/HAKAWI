import type { RentalStatus } from "@hakawi/shared-types";

/**
 * Rentals: the list of borrowed books, one rental in full, and the two actions
 * that are still open on it.
 *
 * OWNED BY THE RENTALS SURFACE. The interface and the two tables live in one
 * file so the Arabic and the English of a sentence cannot drift apart.
 *
 * THE STATUS WORDS LIVE HERE, NOT IN THE BADGE. The pill has two faces — a
 * word for the reader and an identifier for everything else — and the word is
 * the product's copy, so the dictionary owns it. `overdue` is not a stored
 * status: it is DERIVED from the end date, and `rentalState.ts` owns that
 * derivation; the word for it is here because the reader still has to be told.
 */
export interface RentalsStrings {
  /* The list of rentals. */
  pageTitle: string;
  pageDescription: string;
  loadingLabel: string;
  loadFailedTitle: string;
  emptyTitle: string;
  emptyDescription: string;
  browseBooks: string;

  /* One rental, as a row. */
  detailsAction: string;
  extendAction: string;
  returnAction: string;
  /** The title of a rental whose book could not be fetched. */
  unknownBookTitle: string;
  startDateLabel: string;
  endDateLabel: string;
  /** The end date of a rental that has run out — a date in the past, named. */
  overdueEndDateLabel: string;
  extensionsLabel: string;
  returnedAtLabel: string;
  /** The extension lengths a reader may choose, by the number of days. */
  extensionOptions: Record<string, string>;
  /** The accessible name of the extension control, and its placeholder. */
  extensionDurationLabel: string;

  /* The vocabulary of the rental: active, expired, returned, cancelled, overdue. */
  statusLabels: Record<RentalStatus | "overdue", string>;

  /* One rental, in full. */
  detailTitle: string;
  detailsHeading: string;
  actionsHeading: string;
  extendRentalAction: string;
  returnBookAction: string;
  extensionPriceLabel: string;
  authorByline: (name: string) => string;
  updateFromLibrary: string;
  backToRentals: string;
  notFoundTitle: string;
  notFoundDescription: string;
}

export const AR: RentalsStrings = {
  pageTitle: "إيجاراتي",
  pageDescription: "الكتب المستعارة، وتواريخ انتهاءها، والتمديدات المتبقية.",
  loadingLabel: "جارٍ تحميل الإيجارات",
  loadFailedTitle: "تعذّر تحميل تفاصيل الإيجار",
  emptyTitle: "لا توجد إيجارات",
  emptyDescription: "لم تستعر أي كتاب بعد. استعارة كتاب تظهر هنا مع تاريخ انتهائه.",
  browseBooks: "تصفح الكتب",

  detailsAction: "عرض التفاصيل",
  extendAction: "تمديد",
  returnAction: "إرجاع",
  unknownBookTitle: "كتاب",
  startDateLabel: "تاريخ البدء:",
  endDateLabel: "تاريخ الانتهاء:",
  overdueEndDateLabel: "تأخر عن موعد الانتهاء:",
  extensionsLabel: "التمديدات:",
  returnedAtLabel: "تاريخ الإرجاع:",
  extensionOptions: {
    "7": "أسبوع واحد",
    "14": "أسبوعان",
    "30": "شهر واحد",
  },
  extensionDurationLabel: "مدة التمديد",

  statusLabels: {
    active: "نشط",
    expired: "منتهي",
    returned: "مُرجع",
    cancelled: "ملغى",
    overdue: "متأخر",
  },

  detailTitle: "تفاصيل الإيجار",
  detailsHeading: "بيانات الإيجار",
  actionsHeading: "إجراءات",
  extendRentalAction: "تمديد الإيجار",
  returnBookAction: "إرجاع الكتاب",
  extensionPriceLabel: "سعر التمديد",
  authorByline: (name) => `بواسطة ${name}`,
  updateFromLibrary: "تحديث القراءة من مكتبتي",
  backToRentals: "العودة للإيجارات",
  notFoundTitle: "الإيجار غير موجود",
  notFoundDescription: "ربما انتهى هذا الإيجار أو حُذف.",
};

export const EN: RentalsStrings = {
  pageTitle: "My rentals",
  pageDescription: "The books you have borrowed, when they run out, and the extensions you have left.",
  loadingLabel: "Loading your rentals…",
  loadFailedTitle: "Couldn't load the rental",
  emptyTitle: "No rentals yet",
  emptyDescription: "You haven't borrowed a book yet. A borrowed book shows up here with the date it runs out.",
  browseBooks: "Browse books",

  detailsAction: "View details",
  extendAction: "Extend",
  returnAction: "Return",
  unknownBookTitle: "Book",
  startDateLabel: "Start date:",
  endDateLabel: "End date:",
  overdueEndDateLabel: "Overdue since:",
  extensionsLabel: "Extensions:",
  returnedAtLabel: "Returned on:",
  extensionOptions: {
    "7": "One week",
    "14": "Two weeks",
    "30": "One month",
  },
  extensionDurationLabel: "Extension length",

  statusLabels: {
    active: "Active",
    expired: "Expired",
    returned: "Returned",
    cancelled: "Cancelled",
    overdue: "Overdue",
  },

  detailTitle: "Rental details",
  detailsHeading: "Rental details",
  actionsHeading: "Actions",
  extendRentalAction: "Extend rental",
  returnBookAction: "Return the book",
  extensionPriceLabel: "Extension price",
  authorByline: (name) => `By ${name}`,
  updateFromLibrary: "Update reading from my library",
  backToRentals: "Back to rentals",
  notFoundTitle: "Rental not found",
  notFoundDescription: "This rental may have ended or been deleted.",
};
