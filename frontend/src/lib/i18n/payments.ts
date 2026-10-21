import type { PaymentStatus } from "@hakawi/shared-types";

/**
 * Payments: the history of what the reader paid for, and one payment in full.
 *
 * OWNED BY THE PAYMENTS SURFACE. The interface and the two tables live in one
 * file so the Arabic and the English of a sentence cannot drift apart.
 *
 * THE STATUS WORDS LIVE HERE, NOT IN THE BADGE. The pill's word is the
 * product's copy, so the dictionary owns it — and the vocabulary is the one
 * `PAYMENT_STATUSES` declares, because a table that invents a status the API
 * cannot send is a table that will disagree with the server.
 */
export interface PaymentsStrings {
  /* The history. */
  pageTitle: string;
  pageDescription: string;
  loadFailedTitle: string;
  emptyTitle: string;
  emptyDescription: string;

  /* The vocabulary of a payment. */
  statusLabels: Record<PaymentStatus, string>;

  /* One payment, in full. */
  detailTitle: string;
  detailLoadFailedTitle: string;
  notFoundTitle: string;
  notFoundMessage: string;
  backToPayments: string;
  amountLabel: string;
  paymentIdLabel: string;
  userIdLabel: string;
  paymentMethodLabel: string;
  createdAtLabel: string;
  descriptionLabel: string;
}

export const AR: PaymentsStrings = {
  pageTitle: "سجل المدفوعات",
  pageDescription: "كل عمليات الشراء والاشتراك في حكاوي.",
  loadFailedTitle: "فشل تحميل المدفوعات",
  emptyTitle: "لا توجد مدفوعات بعد.",
  emptyDescription: "ستظهر هنا كل عملية شراء أو اشتراك تجريه في حكاوي.",

  statusLabels: {
    pending: "قيد المراجعة",
    processing: "قيد المعالجة",
    completed: "مكتملة",
    failed: "فشلت",
    cancelled: "ملغاة",
    refunded: "مستردّة",
  },

  detailTitle: "تفاصيل الدفع",
  detailLoadFailedTitle: "فشل تحميل تفاصيل الدفع",
  notFoundTitle: "لا يوجد دفع بهذا المعرّف",
  notFoundMessage: "تفاصيل الدفع غير موجودة",
  backToPayments: "العودة للمدفوعات",
  amountLabel: "المبلغ",
  paymentIdLabel: "معرّف الدفع",
  userIdLabel: "معرّف المستخدم",
  paymentMethodLabel: "طريقة الدفع",
  createdAtLabel: "تاريخ الإنشاء",
  descriptionLabel: "الوصف",
};

export const EN: PaymentsStrings = {
  pageTitle: "Payment history",
  pageDescription: "Every purchase and subscription you've made on Hakawi.",
  loadFailedTitle: "Couldn't load the payments",
  emptyTitle: "No payments yet.",
  emptyDescription: "Every purchase or subscription you make on Hakawi will show up here.",

  statusLabels: {
    pending: "Pending review",
    processing: "Processing",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
    refunded: "Refunded",
  },

  detailTitle: "Payment details",
  detailLoadFailedTitle: "Couldn't load the payment details",
  notFoundTitle: "No payment with this id",
  notFoundMessage: "The payment details could not be found.",
  backToPayments: "Back to payments",
  amountLabel: "Amount",
  paymentIdLabel: "Payment id",
  userIdLabel: "User id",
  paymentMethodLabel: "Payment method",
  createdAtLabel: "Created",
  descriptionLabel: "Description",
};
