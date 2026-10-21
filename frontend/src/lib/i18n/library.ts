import type { LibraryItemStatus } from "@hakawi/shared-types";

/**
 * The reader's shelf: the list of books they own or have borrowed, and the
 * state of each one.
 *
 * OWNED BY THE LIBRARY SURFACE. The keys are added here as the surface needs
 * them; the interface and the two tables live in one file so the Arabic and
 * the English of a sentence cannot drift apart.
 *
 * IT ALSO OWNS THE READING PROGRESS CARD, because that card appears on the
 * shelf and on a rental and says the same thing in both places: a progress bar
 * is a fact about a book, and the words around it are the product's, not the
 * page's.
 *
 * THE STATUS WORDS ARE HERE AND NOT IN THE BADGE. A badge that carries its own
 * Arabic table is a badge whose table the English reader never reaches; the
 * vocabulary of the shelf belongs to the shelf's copy, and the badge reads it.
 */
export interface LibraryStrings {
  /* The shelf itself. */
  pageTitle: string;
  pageDescription: string;
  loadingLabel: string;
  loadFailedTitle: string;
  emptyTitle: string;
  emptyDescription: string;
  browseBooks: string;

  /* One entry of the shelf. */
  detailsAction: string;
  removeAction: string;
  /** The title of an entry whose book could not be fetched. */
  unknownBookTitle: string;
  /** The vocabulary of the shelf: owned, rented, reading, completed. */
  statusLabels: Record<LibraryItemStatus, string>;

  /* The progress card, shared with the rental page. */
  progressTitle: string;
  /** The accessible name of the bar itself. */
  progressLabel: string;
  /** The page position, with the total when the book reports one. */
  progressPage: (currentPage: number, totalPages: number | null) => string;
  lastReadLabel: string;
  progressCompletedLabel: string;

  /* One entry of the shelf, in full. */
  detailTitleFallback: string;
  authorByline: (name: string) => string;
  pageCountLabel: string;
  noDescription: string;
  startReading: string;
  updateReading: string;
  removeFromLibrary: string;
  backToLibrary: string;
  notFoundTitle: string;
  notFoundDescription: string;
}

export const AR: LibraryStrings = {
  pageTitle: "مكتبتي",
  pageDescription: "كل ما اشتريته أو استعرته، وتقدّم قراءتك فيه.",
  loadingLabel: "جارٍ تحميل المكتبة",
  loadFailedTitle: "تعذّر تحميل تفاصيل الكتاب",
  emptyTitle: "مكتبتك فارغة",
  emptyDescription: "اشترِ كتاباً أو استعره لتظهر هنا، وسيحفظ تقدم قراءتك تلقائياً.",
  browseBooks: "تصفح الكتب",

  detailsAction: "عرض التفاصيل",
  removeAction: "إزالة",
  unknownBookTitle: "كتاب",
  statusLabels: {
    owned: "مملوك",
    rented: "مستأجر",
    reading: "قيد القراءة",
    completed: "مكتمل",
  },

  progressTitle: "تقدم القراءة",
  progressLabel: "تقدم القراءة",
  progressPage: (currentPage, totalPages) =>
    totalPages ? `الصفحة ${currentPage} من ${totalPages}` : `الصفحة ${currentPage}`,
  lastReadLabel: "آخر قراءة:",
  progressCompletedLabel: "اكتملت القراءة:",

  detailTitleFallback: "الكتاب",
  authorByline: (name) => `بواسطة ${name}`,
  pageCountLabel: "عدد الصفحات:",
  noDescription: "لا يوجد وصف لهذا الكتاب.",
  startReading: "بدء القراءة",
  updateReading: "تحديث القراءة",
  removeFromLibrary: "إزالة من المكتبة",
  backToLibrary: "العودة للمكتبة",
  notFoundTitle: "الكتاب غير موجود في مكتبتك",
  notFoundDescription: "ربما أزلته، أو أن الرابط يشير إلى عنصر لم يعد لك.",
};

export const EN: LibraryStrings = {
  pageTitle: "My library",
  pageDescription: "Everything you bought or borrowed, and how far you have read in it.",
  loadingLabel: "Loading your library…",
  loadFailedTitle: "Couldn't load the book",
  emptyTitle: "Your library is empty",
  emptyDescription: "Buy or borrow a book and it will appear here, along with the progress you make in it.",
  browseBooks: "Browse books",

  detailsAction: "View details",
  removeAction: "Remove",
  unknownBookTitle: "Book",
  statusLabels: {
    owned: "Owned",
    rented: "Borrowed",
    reading: "Reading",
    completed: "Finished",
  },

  progressTitle: "Reading progress",
  progressLabel: "Reading progress",
  progressPage: (currentPage, totalPages) =>
    totalPages ? `Page ${currentPage} of ${totalPages}` : `Page ${currentPage}`,
  lastReadLabel: "Last read:",
  progressCompletedLabel: "Reading completed:",

  detailTitleFallback: "Book",
  authorByline: (name) => `By ${name}`,
  pageCountLabel: "Pages:",
  noDescription: "This book has no description.",
  startReading: "Start reading",
  updateReading: "Update reading",
  removeFromLibrary: "Remove from library",
  backToLibrary: "Back to library",
  notFoundTitle: "This book isn't in your library",
  notFoundDescription: "You may have removed it, or the link points to an item you no longer have.",
};
