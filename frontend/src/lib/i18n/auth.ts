/** Auth flows: login, register, password recovery, OAuth callback and errors. */
export interface AuthStrings {
  loginTitle: string;
  loginButton: string;
  loginError: string;
  loginFooter: string;
  loginCreateAccountLink: string;
  loginForgotPasswordLink: string;
  registerTitle: string;
  registerButton: string;
  registerError: string;
  registerFooter: string;
  registerLoginLink: string;
  nameLabel: string;
  namePlaceholder: string;
  usernameLabel: string;
  usernamePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  passwordHint: string;
  confirmPasswordLabel: string;
  confirmPasswordPlaceholder: string;
  passwordsMismatch: string;
  forgotTitle: string;
  forgotDescription: string;
  forgotButton: string;
  forgotError: string;
  forgotSuccessTitle: string;
  forgotSuccessText: string;
  forgotBackToLogin: string;
  resetTitle: string;
  resetDescription: string;
  resetNewPasswordLabel: string;
  resetConfirmPasswordLabel: string;
  resetButton: string;
  resetError: string;
  resetTokenInvalid: string;
  resetSuccessTitle: string;
  resetSuccessText: string;
  resetBackToLogin: string;
  callbackTitle: string;
  callbackLoading: string;
  callbackErrorTitle: string;
  callbackError: string;
  callbackBackToLogin: string;
  errorPageTitle: string;
  errorReasonTitle: string;
  errorUnknown: string;
  errorUnknownPrefix: string;
  authErrorAccessDenied: string;
  authErrorMissingCode: string;
  authErrorOauthFailed: string;
  authErrorInvalidRequest: string;
  authErrorBackToLogin: string;
  authGuardLoading: string;
  authGuardRetry: string;
  authGuardError: string;
}

export const AR: AuthStrings = {
  loginTitle: "تسجيل الدخول",
  loginButton: "تسجيل الدخول",
  loginError: "فشل تسجيل الدخول",
  loginFooter: "ليس لديك حساب؟",
  loginCreateAccountLink: "إنشاء حساب جديد",
  loginForgotPasswordLink: "نسيت كلمة المرور؟",
  registerTitle: "إنشاء حساب جديد",
  registerButton: "إنشاء الحساب",
  registerError: "فشل إنشاء الحساب",
  registerFooter: "لديك حساب بالفعل؟",
  registerLoginLink: "تسجيل الدخول",
  nameLabel: "الاسم الكامل",
  namePlaceholder: "أحمد محمد",
  usernameLabel: "اسم المستخدم",
  usernamePlaceholder: "ahmed",
  emailLabel: "البريد الإلكتروني",
  emailPlaceholder: "example@mail.com",
  passwordLabel: "كلمة المرور",
  passwordPlaceholder: "••••••••",
  passwordHint: "8 أحرف على الأقل، مع حرف كبير وحرف صغير ورقم ورمز",
  confirmPasswordLabel: "تأكيد كلمة المرور",
  confirmPasswordPlaceholder: "••••••••",
  passwordsMismatch: "كلمتا المرور غير متطابقتين",
  forgotTitle: "استعادة كلمة المرور",
  forgotDescription: "أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين",
  forgotButton: "إرسال رابط إعادة التعيين",
  forgotError: "فشل إرسال رابط إعادة التعيين",
  forgotSuccessTitle: "تم إرسال الطلب",
  forgotSuccessText:
    "إذا كان هناك حساب بهذا البريد الإلكتروني، فقد أرسلنا رابط إعادة تعيين كلمة المرور.",
  forgotBackToLogin: "العودة لتسجيل الدخول",
  resetTitle: "إعادة تعيين كلمة المرور",
  resetDescription: "اختر كلمة مرور جديدة، وسيتم تسجيلك بها عند الدخول التالي",
  resetNewPasswordLabel: "كلمة المرور الجديدة",
  resetConfirmPasswordLabel: "تأكيد كلمة المرور الجديدة",
  resetButton: "إعادة تعيين كلمة المرور",
  resetError: "فشل إعادة تعيين كلمة المرور",
  resetTokenInvalid: "رابط إعادة التعيين غير صالح",
  resetSuccessTitle: "تم",
  resetSuccessText: "تم إعادة تعيين كلمة المرور بنجاح! جاري التحويل لتسجيل الدخول...",
  resetBackToLogin: "العودة لتسجيل الدخول",
  callbackTitle: "إكمال تسجيل الدخول",
  callbackLoading: "جاري إكمال تسجيل الدخول...",
  callbackErrorTitle: "فشل إكمال تسجيل الدخول",
  callbackError: "فشل إكمال تسجيل الدخول",
  callbackBackToLogin: "العودة لتسجيل الدخول",
  errorPageTitle: "خطأ في تسجيل الدخول",
  errorReasonTitle: "سبب الخطأ",
  errorUnknown: "غير معروف",
  errorUnknownPrefix: "خطأ: ",
  authErrorAccessDenied: "تم رفض الوصول من قبل مزود المصادقة",
  authErrorMissingCode: "رمز التفويض مفقود",
  authErrorOauthFailed: "فشل عملية تسجيل الدخول عبر OAuth",
  authErrorInvalidRequest: "طلب غير صالح",
  authErrorBackToLogin: "العودة لتسجيل الدخول",
  authGuardLoading: "جاري التحقق من الجلسة",
  authGuardRetry: "إعادة المحاولة",
  authGuardError: "تعذر التحقق من حالة الجلسة",
};

export const EN: AuthStrings = {
  loginTitle: "Sign in",
  loginButton: "Sign in",
  loginError: "Couldn't sign in",
  loginFooter: "Don't have an account?",
  loginCreateAccountLink: "Create an account",
  loginForgotPasswordLink: "Forgot your password?",
  registerTitle: "Create an account",
  registerButton: "Create account",
  registerError: "Couldn't create account",
  registerFooter: "Already have an account?",
  registerLoginLink: "Sign in",
  nameLabel: "Full name",
  namePlaceholder: "Ahmed Mohamed",
  usernameLabel: "Username",
  usernamePlaceholder: "ahmed",
  emailLabel: "Email",
  emailPlaceholder: "example@mail.com",
  passwordLabel: "Password",
  passwordPlaceholder: "••••••••",
  passwordHint: "At least 8 characters, with an uppercase, a lowercase, a number, and a symbol",
  confirmPasswordLabel: "Confirm password",
  confirmPasswordPlaceholder: "••••••••",
  passwordsMismatch: "The two passwords don't match",
  forgotTitle: "Reset your password",
  forgotDescription: "Enter your email and we'll send you a reset link",
  forgotButton: "Send reset link",
  forgotError: "Couldn't send the reset link",
  forgotSuccessTitle: "Request sent",
  forgotSuccessText:
    "If an account exists for this email, we've sent a password reset link.",
  forgotBackToLogin: "Back to sign in",
  resetTitle: "Reset your password",
  resetDescription: "Choose a new password; you'll sign in with it next time",
  resetNewPasswordLabel: "New password",
  resetConfirmPasswordLabel: "Confirm new password",
  resetButton: "Reset password",
  resetError: "Couldn't reset your password",
  resetTokenInvalid: "This reset link is invalid",
  resetSuccessTitle: "Done",
  resetSuccessText: "Your password has been reset. Signing you in...",
  resetBackToLogin: "Back to sign in",
  callbackTitle: "Finishing sign in",
  callbackLoading: "Finishing sign-in…",
  callbackErrorTitle: "Sign-in failed",
  callbackError: "Couldn't finish signing you in",
  callbackBackToLogin: "Back to sign in",
  errorPageTitle: "Login error",
  errorReasonTitle: "What went wrong",
  errorUnknown: "Unknown",
  errorUnknownPrefix: "Error: ",
  authErrorAccessDenied: "Access was denied by the authentication provider",
  authErrorMissingCode: "The authorization code is missing",
  authErrorOauthFailed: "The OAuth login failed",
  authErrorInvalidRequest: "Invalid request",
  authErrorBackToLogin: "Back to sign in",
  authGuardLoading: "Verifying your session",
  authGuardRetry: "Retry",
  authGuardError: "Couldn't verify your session",
};
