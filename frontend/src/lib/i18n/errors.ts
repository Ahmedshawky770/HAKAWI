import type { AppErrorCode } from "@/lib/errors";

/**
 * What each failure is called, in the reader's language.
 *
 * The codes come from `lib/errors.ts` — the client classifies what came back
 * into one of them, and this table turns that code into a sentence. The table
 * is exhaustive on purpose: `Record<AppErrorCode, string>` means a new code
 * cannot be added to the classifier without someone writing what to say about
 * it, and a code with no sentence cannot reach a reader as a blank.
 *
 * The rule every line follows: THE SENTENCE IS ABOUT THE READER'S SITUATION,
 * NOT ABOUT THE SYSTEM'S. "Invalid email or password" is a fact about a
 * database row; "البريد الإلكتروني أو كلمة المرور غير صحيحة" is a fact about
 * the reader, and it tells them what to do next.
 */
export type ErrorStrings = Record<AppErrorCode, string>;

export const AR: ErrorStrings = {
  invalidCredentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  emailInUse: "هذا البريد الإلكتروني مسجّل بالفعل. جرّب تسجيل الدخول.",
  usernameInUse: "اسم المستخدم محجوز. اختر اسماً آخر.",
  emailNotVerified: "لم يتم تأكيد بريدك الإلكتروني بعد. افحص صندوق الوارد.",
  accountDisabled: "حسابك معطّل حالياً. تواصل مع الدعم.",
  accountBanned: "حسابك موقوف. تواصل مع الدعم.",
  invalidResetToken: "رابط إعادة التعيين غير صالح أو منتهي. اطلب رابطاً جديداً.",
  sessionExpired: "انتهت جلستك. سجّل الدخول من جديد.",
  notFound: "لم نعثر على ما تبحث عنه.",
  conflict: "هذا الإجراء تعذّر لأن العنصر موجود بالفعل.",
  validation: "البيانات المُرسلة غير صالحة. راجعها وحاول مرة أخرى.",
  forbidden: "هذا الإجراء يحتاج صلاحية أعلى من التي لديك.",
  paymentDeclined: "لم تكتمل عملية الدفع. جرّب وسيلة دفع أخرى.",
  paymentUnavailable: "بوابة الدفع غير متاحة الآن. حاول بعد قليل.",
  rateLimited: "محاولات كثيرة في وقت قصير. انتظر قليلاً ثم أعد المحاولة.",
  network: "تعذّر الاتصال بالإنترنت. تحقّق من اتصالك وأعد المحاولة.",
  server: "حدث خطأ في الخادم. حاول مرة أخرى بعد قليل.",
  unknown: "تعذّر إتمام العملية. حاول مرة أخرى.",
};

export const EN: ErrorStrings = {
  invalidCredentials: "That email and password don't match.",
  emailInUse: "This email is already registered. Try signing in.",
  usernameInUse: "That username is taken. Choose another one.",
  emailNotVerified: "Your email isn't verified yet. Check your inbox.",
  accountDisabled: "Your account is disabled. Contact support.",
  accountBanned: "Your account is suspended. Contact support.",
  invalidResetToken: "This reset link is invalid or has expired. Request a new one.",
  sessionExpired: "Your session has ended. Please sign in again.",
  notFound: "We couldn't find what you were looking for.",
  conflict: "That couldn't be done because it already exists.",
  validation: "That information isn't valid. Check it and try again.",
  forbidden: "That action needs a higher role than yours.",
  paymentDeclined: "The payment didn't go through. Try another payment method.",
  paymentUnavailable: "The payment gateway is unavailable right now. Try again shortly.",
  rateLimited: "Too many attempts in a short time. Wait a moment and try again.",
  network: "We couldn't reach the server. Check your connection and try again.",
  server: "Something went wrong on our side. Try again in a moment.",
  unknown: "We couldn't finish that. Please try again.",
};
