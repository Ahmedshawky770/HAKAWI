/**
 * The catalogue: the list of books, one book in full, and the form that
 * publishes one.
 *
 * OWNED BY THE BOOKS SURFACE. The interface and the two tables live in one
 * file so the Arabic and the English of a sentence cannot drift apart.
 */
import type { RentalDurationDays } from "@hakawi/shared-types";

export interface BooksStrings {
  /* The catalogue list. */
  listTitle: string;
  listDescription: string;
  listLoadFailed: string;
  listLoadingLabel: string;
  listEmptyTitle: string;
  listEmptyDescription: string;
  /** The link an empty catalogue points at. */
  browseStories: string;

  /* One book. */
  byAuthor: (name: string) => string;
  pageCountLabel: string;
  aboutHeading: string;
  noDescription: string;
  backToBooks: string;
  notFoundTitle: string;
  notFoundDescription: string;
  loadFailedTitle: string;

  /* What the owner can do to their own book. */
  ownerActionsHeading: string;
  publishButton: string;
  archiveButton: string;
  deleteButton: string;
  deleteConfirmButton: string;
  deleteCancelButton: string;
  deleteWarning: string;
  publishSucceeded: string;
  archiveSucceeded: string;
  deleteSucceeded: string;

  /* Buying and renting. */
  buyOrRentHeading: string;
  claimFreeButton: string;
  claimFreeSucceeded: string;
  rentalDurationLabel: string;
  /**
   * The name of each rental length.
   *
   * Keyed by the shared `RENTAL_DURATION_DAYS`, so a length the API accepts
   * cannot be rendered without a name, and a name cannot exist for a length
   * the API does not accept.
   */
  rentalDurationLabels: Record<RentalDurationDays, string>;
  rentButton: string;
  purchaseButton: string;
  buyOrRentFailed: string;

  /* The ISBN lookup. */
  isbnHeading: string;
  isbnLabel: string;
  isbnPlaceholder: string;
  isbnRequired: string;
  isbnLookupButton: string;
  isbnLookupSucceeded: string;

  /* Downloading. */
  downloadButton: string;

  /* Publishing a book. */
  createTitle: string;
  createDescription: string;
  createSubmitButton: string;
  createFailed: string;
  titleLabel: string;
  titlePlaceholder: string;
  authorLabel: string;
  authorPlaceholder: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  coverLabel: string;
  coverPlaceholder: string;
  isbnFieldLabel: string;
  publisherLabel: string;
  publishDateLabel: string;
  languageLabel: string;
  /** The placeholder of the language field: the language the book is written in. */
  languagePlaceholder: string;
  /** The label of the file-type field. */
  fileTypeLabel: string;
  /** The placeholder of the file-type field. */
  fileTypePlaceholder: string;
  pageCountFieldLabel: string;
  priceLabel: string;
  priceHint: string;
  freeLabel: string;
  categoryLabel: string;
  fileLabel: string;
  fileHint: string;
  cancelButton: string;
}

export const AR: BooksStrings = {
  listTitle: "الكتب",
  listDescription: "كل ما نُشر في المكتبة، وأحدثه أولاً.",
  listLoadFailed: "تعذّر تحميل الكتب",
  listLoadingLabel: "جارٍ تحميل الكتب",
  listEmptyTitle: "لا توجد كتب بعد",
  listEmptyDescription: "كن أول من ينشر كتاباً في حكاوي.",
  browseStories: "تصفح القصص",

  byAuthor: (name) => `بواسطة ${name}`,
  pageCountLabel: "عدد الصفحات",
  aboutHeading: "نبذة عن الكتاب",
  noDescription: "لا يوجد وصف لهذا الكتاب بعد.",
  backToBooks: "العودة للكتب",
  notFoundTitle: "الكتاب غير موجود",
  notFoundDescription: "ربما حُذف الكتاب أو تغيّر رابطه.",
  loadFailedTitle: "تعذّر تحميل الكتاب",

  ownerActionsHeading: "إدارة الكتاب",
  publishButton: "نشر الكتاب",
  archiveButton: "أرشفة الكتاب",
  deleteButton: "حذف الكتاب",
  deleteConfirmButton: "تأكيد الحذف",
  deleteCancelButton: "تراجع",
  deleteWarning: "سيُحذف الكتاب نهائياً. لا يمكن التراجع عن هذه الخطوة.",
  publishSucceeded: "تم نشر الكتاب",
  archiveSucceeded: "تم أرشفة الكتاب",
  deleteSucceeded: "تم حذف الكتاب",

  buyOrRentHeading: "الشراء أو الإيجار",
  claimFreeButton: "الحصول على الكتاب مجاناً",
  claimFreeSucceeded: "تمت إضافة الكتاب إلى مكتبتك",
  rentalDurationLabel: "مدة الإيجار",
  rentalDurationLabels: {
    1: "يوم واحد",
    3: "3 أيام",
    7: "أسبوع",
    14: "أسبوعين",
    30: "شهر",
    90: "3 أشهر",
  },
  rentButton: "استئجار الكتاب",
  purchaseButton: "اشترِ الكتاب",
  buyOrRentFailed: "تعذّر إتمام الشراء أو الاستئجار",

  isbnHeading: "البحث عن طريق ISBN",
  isbnLabel: "ISBN",
  isbnPlaceholder: "978-3-16-148410-0",
  isbnRequired: "الرجاء إدخال ISBN",
  isbnLookupButton: "جلب التفاصيل",
  isbnLookupSucceeded: "تم جلب تفاصيل الكتاب",

  downloadButton: "تحميل الكتاب",

  createTitle: "نشر كتاب",
  createDescription: "أضف كتابك إلى مكتبة حكاوي، ليصل إلى القرّاء.",
  createSubmitButton: "نشر الكتاب",
  createFailed: "فشل نشر الكتاب",
  titleLabel: "العنوان",
  titlePlaceholder: "أدخل عنوان الكتاب",
  authorLabel: "المؤلف",
  authorPlaceholder: "اسم المؤلف",
  descriptionLabel: "الوصف",
  descriptionPlaceholder: "نبذة عن الكتاب",
  coverLabel: "صورة الغلاف",
  coverPlaceholder: "رابط صورة الغلاف",
  isbnFieldLabel: "ISBN",
  publisherLabel: "الناشر",
  publishDateLabel: "تاريخ النشر",
  languageLabel: "اللغة",
  languagePlaceholder: "العربية",
  fileTypeLabel: "نوع الملف",
  fileTypePlaceholder: "pdf",
  pageCountFieldLabel: "عدد الصفحات",
  priceLabel: "السعر",
  priceHint: "بالبيسترات — مثال: 2500 يعني 25.00 ج.م",
  freeLabel: "كتاب مجاني",
  categoryLabel: "التصنيف",
  fileLabel: "ملف الكتاب",
  fileHint: "رابط ملف قابل للتنزيل (PDF).",
  cancelButton: "إلغاء",
};

export const EN: BooksStrings = {
  listTitle: "Books",
  listDescription: "Everything published in the library, newest first.",
  listLoadFailed: "Couldn't load the books",
  listLoadingLabel: "Loading the books",
  listEmptyTitle: "No books yet",
  listEmptyDescription: "No book has been published yet. The stories are here now, and the books will follow.",
  browseStories: "Browse the stories",

  byAuthor: (name) => `By ${name}`,
  pageCountLabel: "Pages",
  aboutHeading: "About this book",
  noDescription: "There's no description for this book yet.",
  backToBooks: "Back to books",
  notFoundTitle: "Book not found",
  notFoundDescription: "It may have been deleted, or its link may have changed.",
  loadFailedTitle: "Couldn't load the book",

  ownerActionsHeading: "Manage the book",
  publishButton: "Publish the book",
  archiveButton: "Archive the book",
  deleteButton: "Delete the book",
  deleteConfirmButton: "Confirm deletion",
  deleteCancelButton: "Cancel",
  deleteWarning: "The book will be deleted for good. This cannot be undone.",
  publishSucceeded: "The book was published",
  archiveSucceeded: "The book was archived",
  deleteSucceeded: "The book was deleted",

  buyOrRentHeading: "Buy or rent",
  claimFreeButton: "Add the book to your library",
  claimFreeSucceeded: "The book was added to your library",
  rentalDurationLabel: "Rental length",
  rentalDurationLabels: {
    1: "One day",
    3: "3 days",
    7: "A week",
    14: "Two weeks",
    30: "A month",
    90: "3 months",
  },
  rentButton: "Rent the book",
  purchaseButton: "Buy the book",
  buyOrRentFailed: "Couldn't buy or rent the book",

  isbnHeading: "Look up by ISBN",
  isbnLabel: "ISBN",
  isbnPlaceholder: "978-3-16-148410-0",
  isbnRequired: "Please enter an ISBN",
  isbnLookupButton: "Fetch the details",
  isbnLookupSucceeded: "The book's details were fetched",

  downloadButton: "Download the book",

  createTitle: "Publish a book",
  createDescription: "Add your book to the Hakawi library, where readers will find it.",
  createSubmitButton: "Publish the book",
  createFailed: "Couldn't publish the book",
  titleLabel: "Title",
  titlePlaceholder: "Enter the book's title",
  authorLabel: "Author",
  authorPlaceholder: "The author's name",
  descriptionLabel: "Description",
  descriptionPlaceholder: "A short note about the book",
  coverLabel: "Cover image",
  coverPlaceholder: "A link to the cover image",
  isbnFieldLabel: "ISBN",
  publisherLabel: "Publisher",
  publishDateLabel: "Publication date",
  languageLabel: "Language",
  languagePlaceholder: "Arabic",
  fileTypeLabel: "File type",
  fileTypePlaceholder: "pdf",
  pageCountFieldLabel: "Number of pages",
  priceLabel: "Price",
  priceHint: "In piastres — 2500 means 25.00 EGP",
  freeLabel: "Free book",
  categoryLabel: "Category",
  fileLabel: "Book file",
  fileHint: "A link to a downloadable file (PDF).",
  cancelButton: "Cancel",
};
