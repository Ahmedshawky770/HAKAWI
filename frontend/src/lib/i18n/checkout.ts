/**
 * The checkout: how a reader pays for a book or a rental, and what the
 * gateway step says.
 *
 * WHY THIS IS A NAMESPACE AND NOT A FIELD ON THE BOOK PAGE. The flow has four
 * states — choosing a method, creating the payment, paying at the gateway, and
 * the receipt — and each one is a sentence a reader reads at the moment they
 * are deciding. Keeping them together is what lets the Arabic and the English
 * of the same moment sit side by side; spreading them through the page is what
 * let them drift.
 *
 * THE VOCABULARY IS THE READER'S. A reader chooses "بطاقة ائتمانية" or "محفظة
 * إلكترونية". They are never asked for a "معرّف طريقة الدفع" — a gateway
 * identifier is a fact about the implementation, and a reader who does not have
 * one was previously told to type `pm_123456` into a text box.
 *
 * AND THE CHOICE IS REAL, NOT DECORATION. The two words travel to the API as
 * the reader's CHOICE, and the server resolves them to this merchant's own
 * Paymob method id, so the payment frame opens on the instrument the reader
 * picked. A deployment that has not configured that id is the one case where
 * the gateway asks the customer instead — and the words here are still the ones
 * that describe what the reader chose.
 */
export interface CheckoutStrings {
  /** The question above the method choices. */
  chooseMethod: string;
  /** The card option. */
  cardLabel: string;
  /** What the card option covers. */
  cardDescription: string;
  /** The mobile-wallet option. */
  walletLabel: string;
  /** What the wallet option covers. */
  walletDescription: string;
  /** The button that starts the payment. */
  continueButton: string;
  /** The button that abandons the checkout. */
  cancelButton: string;
  /** The heading of the gateway step. */
  gatewayTitle: string;
  /** The sentence under the gateway heading. */
  gatewayHint: string;
  /** The link that opens the gateway in its own tab, for a blocked iframe. */
  openInNewTab: string;
  /** The link to the payments history, for a reader who wants the receipt. */
  viewPayments: string;
  /** What the button says while the payment is being created. */
  pendingLabel: string;
  /** The label of the total that is about to be charged. */
  totalLabel: string;
  /** The title of a purchase checkout. */
  purchaseTitle: string;
  /** The title of a rental checkout. */
  rentalTitle: string;
  /** The frame's accessible name. */
  gatewayFrameLabel: string;
  /** Shown when the gateway URL the server sent is not the gateway's own. */
  gatewayUnavailable: string;
}

export const AR: CheckoutStrings = {
  chooseMethod: "كيف تريد الدفع؟",
  cardLabel: "بطاقة ائتمانية",
  cardDescription: "فيزا وماستركارد",
  walletLabel: "محفظة إلكترونية",
  walletDescription: "فودافون كاش، أورنج موني، اتصالات كاش",
  continueButton: "متابعة الدفع",
  cancelButton: "إلغاء",
  gatewayTitle: "ادفع بأمان",
  gatewayHint:
    "أكمل الدفع في النافذة أدناه. سيُضاف الكتاب إلى مكتبتك فور تأكيد بوابة الدفع.",
  openInNewTab: "افتح صفحة الدفع في تبويب جديد",
  viewPayments: "عرض مدفوعاتي",
  pendingLabel: "جارٍ إنشاء عملية الدفع…",
  totalLabel: "المبلغ المطلوب",
  purchaseTitle: "شراء الكتاب",
  rentalTitle: "استئجار الكتاب",
  gatewayFrameLabel: "بوابة الدفع",
  gatewayUnavailable: "تعذّر فتح بوابة الدفع. جرّب فتح صفحة الدفع في تبويب جديد.",
};

export const EN: CheckoutStrings = {
  chooseMethod: "How would you like to pay?",
  cardLabel: "Credit card",
  cardDescription: "Visa and Mastercard",
  walletLabel: "Mobile wallet",
  walletDescription: "Vodafone Cash, Orange Money and Etisalat Cash",
  continueButton: "Continue to payment",
  cancelButton: "Cancel",
  gatewayTitle: "Pay securely",
  gatewayHint:
    "Complete the payment in the window below. Your book is added as soon as the gateway confirms it.",
  openInNewTab: "Open the payment page in a new tab",
  viewPayments: "See my payments",
  pendingLabel: "Creating the payment…",
  totalLabel: "Amount to pay",
  purchaseTitle: "Buy the book",
  rentalTitle: "Rent the book",
  gatewayFrameLabel: "Payment gateway",
  gatewayUnavailable:
    "The payment page could not be opened. Try opening it in a new tab instead.",
};
