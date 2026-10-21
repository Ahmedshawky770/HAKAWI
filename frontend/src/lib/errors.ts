/**
 * One vocabulary for "what went wrong", shared by the client and the copy.
 *
 * WHY THE RAW SERVER MESSAGE IS NOT SHOWN TO A READER. The API answers in
 * English and in the vocabulary of the implementation — "Invalid email or
 * password", "Email already exists", "The payment gateway is unavailable, so no
 * checkout URL was created: …". Those strings were passed straight to the
 * screen: a reader signing in with the wrong password was told "Invalid email or
 * password" in an Arabic interface, and a reader whose payment failed was
 * told about a "checkout URL" and a gateway. The message is a fact about the
 * system, not about the reader's situation.
 *
 * SO THE ERROR IS CLASSIFIED, NOT DISPLAYED. `classifyError` maps whatever
 * came back — a message, a status, a thrown `TypeError` from `fetch` — onto one
 * of the codes below, and the dictionary turns that code into a sentence for the
 * reader in their language. The server's own wording is not shown to a reader;
 * it is what the classifier reads, and it stays in the browser console for the
 * team.
 *
 * WHY THE STATUS IS CARRIED AND NOT DROPPED. The API client used to throw a
 * plain `Error` and drop the HTTP status on the floor, which left the
 * substring table as the ONLY thing that could classify a failure. That is one
 * table away from a lock-out: the server answers a locked-out sign-in with a
 * 401 and the sentence "Too many failed attempts. Please try again after 5
 * minutes.", and a table that did not know that sentence classified it as
 * "unknown" — which the sign-in screen then showed as "something went wrong".
 *
 * Worse, the table knew the phrase "no token provided" and "unauthorized" but
 * NOT the phrase the server actually uses for an expired session — "Invalid or
 * expired token" (`backend/src/common/guards/jwt-auth.guard.ts`). A reader whose
 * access token had simply expired was therefore NOT recognised as signed out:
 * the session guard sent them to an error screen with a retry button instead of
 * the sign-in screen, and the retry could never succeed because nothing
 * refreshes the token. The status is what makes the verdict reliable; the
 * wording is what makes it precise.
 *
 * AND WHY THE SESSION'S END IS A FACT ON THE ERROR, NOT A SECOND OPINION.
 * Two places used to decide, independently, whether a 401 had ended the
 * session: the API client announced "the session is gone" for EVERY 401, and
 * the session guard asked the classifier whether the failure was a
 * `sessionExpired`. The two disagreed, and the disagreement had two faces:
 *
 *   · the API answers a disabled account with a 401 and the sentence "Account
 *     has been disabled", which the classifier reads as `accountDisabled` — so
 *     the guard treated a permanently blocked account as a generic failure and
 *     showed a retry button that could never succeed;
 *   · and because the cache is emptied only when the guard says the reader is
 *     signed out, a 401 the classifier did not call `sessionExpired` left the
 *     previous reader's conversations, library and payments in the cache.
 *
 * So the verdict now travels ON the error — `ApiError.endsSession` — and every
 * layer reads that one fact. There is no second opinion left to disagree with.
 */

export const APP_ERROR_CODES = [
  "invalidCredentials",
  "emailInUse",
  "usernameInUse",
  "emailNotVerified",
  "accountDisabled",
  "accountBanned",
  "invalidResetToken",
  "captchaRequired",
  "sessionExpired",
  "notFound",
  "conflict",
  "validation",
  "forbidden",
  "paymentDeclined",
  "paymentUnavailable",
  "rateLimited",
  "network",
  "server",
  "unknown",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

/**
 * Whether a string is one of the codes.
 *
 * Used where a code arrives from OUTSIDE the classifier — a query parameter,
 * a stored value — and has to be checked before it is used as one.
 */
export function isAppErrorCode(value: string | null | undefined): value is AppErrorCode {
  return typeof value === "string" && (APP_ERROR_CODES as readonly string[]).includes(value);
}

/**
 * The codes that mean "this account can never be used again".
 *
 * They are not a failed sign-in and they are not an ended session: the reader
 * has to be told what actually happened, because signing in again with the same
 * credentials will fail the same way.
 */
export const BLOCKED_ACCOUNT_CODES = ["accountDisabled", "accountBanned"] as const;

export type BlockedAccountCode = (typeof BLOCKED_ACCOUNT_CODES)[number];

/**
 * The error the API client throws.
 *
 * WHY IT IS A CLASS AND NOT A PLAIN `Error`. Three facts have to travel with a
 * failure: what the server SAID, what the server ANSWERED with, and whether
 * the failure ENDED THE SESSION. The message alone was not enough — it is the
 * wording that changes with the server's copy, and the wording is what the
 * classifier has to guess from. The status is the part that does not change: a
 * 401 is a 401 whether the server called it "Invalid or expired token" or "No
 * token provided". The session verdict is the part that must not be re-derived
 * by two layers that can disagree.
 *
 * It extends `Error`, so every existing `catch` that reads `error.message` and
 * every `instanceof Error` check keeps working; the extra fields are an
 * addition, not a replacement.
 */
export class ApiError extends Error {
  /** The HTTP status the server answered with. */
  readonly status: number;
  /** The per-field details the server sent, when it sent any. */
  readonly details: readonly string[];
  /**
   * TRUE when this failure ended the session the request was made with.
   *
   * It is set in ONE place — the API client, which is the only layer that
   * knows whether the request was made with a session or was an attempt to
   * ESTABLISH one. A sign-in that is refused does NOT end the session the
   * reader already has: the wrong password is a fact about the attempt, not
   * about the session, and destroying the session because of it would sign the
   * reader out for trying to switch accounts.
   */
  readonly endsSession: boolean;
  /** TRUE when the server refused the sign-in until a CAPTCHA is solved. */
  readonly captchaRequired: boolean;
  /**
   * THE CAPTCHA THE SERVER WANTS, AND THE KEY IT IS RENDERED WITH.
   *
   * The server answers a sign-in that is under a CAPTCHA watch with a 401 and a body
   * that names the provider and the site key. Both are facts about the DEPLOYMENT, not
   * about the reader, and both are needed to draw the widget: the provider says which
   * script to load, and the site key says which tenant the widget belongs to.
   *
   * `null` when the server did not name one — and the reader is then told that a
   * verification is needed, without a widget to show, which is a fact about a
   * misconfigured deployment rather than about the reader.
   */
  readonly captchaProvider: string | null;
  readonly captchaSiteKey: string | null;
  /**
   * TRUE when the server refused the request because it needs a SECOND FACTOR.
   *
   * This is a 401 like any other, and it used to be read as one: the reader who tried
   * to do something that needs a code from their phone was told their session had ended,
   * and was thrown to the sign-in screen. A second factor is not a lost session — the
   * session is alive and the reader simply has to prove who they are once more — so the
   * client asks for the code and makes the request again.
   */
  readonly mfaChallenge: boolean;

  constructor(
    message: string,
    status: number,
    options: {
      details?: readonly string[];
      endsSession?: boolean;
      captchaRequired?: boolean;
      captchaProvider?: string | null;
      captchaSiteKey?: string | null;
      mfaChallenge?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = options.details ?? [];
    this.endsSession = options.endsSession ?? false;
    this.captchaRequired = options.captchaRequired ?? false;
    this.captchaProvider = options.captchaProvider ?? null;
    this.captchaSiteKey = options.captchaSiteKey ?? null;
    this.mfaChallenge = options.mfaChallenge ?? false;
  }
}

/**
 * The server phrases this client knows, in the order they are tested.
 *
 * The order matters: "Account has been disabled" and "Account has been banned"
 * are distinct codes, "Invalid email or password" is checked before the generic
 * "invalid" rule so a wrong password is never reported as a bad request, and
 * the rate-limit rule comes AFTER the session rule on purpose — a locked-out
 * sign-in is a 401, and a table that checked the status first would have called
 * it an expired session.
 *
 * EVERY PHRASE HERE IS A SENTENCE THE SERVER ACTUALLY SENDS. The list was
 * read out of `backend/src` — out of the `throw new *Exception("…")` calls
 * themselves — so a phrase is never a guess: a phrase the server does not send
 * teaches the client to recognise nothing, and a sentence the server DOES send
 * that is missing from this table teaches it to call a real failure "unknown".
 * A phrase that used to be here and was never sent ("email already
 * registered", "verify your email", "payment declined") was removed rather than
 * left to look like coverage.
 */
const RULES: readonly {
  code: AppErrorCode;
  phrases: readonly string[];
  /**
   * TRUE when this rule may still decide the outcome on a 5xx.
   *
   * A server fault is the server's problem, not the reader's, and the reader
   * cannot do anything about it — with ONE exception: a fault the server
   * explained in a way the reader CAN act on. "The payment gateway is
   * unavailable, so no checkout URL was created" is a 503, and it means "try
   * again shortly", which is a sentence worth reading. Every other 5xx is
   * "something went wrong on our side", and the rules below are not consulted
   * for it.
   */
  onServerFault?: boolean;
}[] = [
  { code: "invalidCredentials", phrases: ["invalid email or password", "invalid credentials"] },
  {
    // The server refuses a sign-in that is under a CAPTCHA watch with a 401
    // and this sentence (`backend/src/modules/auth/auth.service.ts`). It is
    // checked BEFORE the session rule because it is also a 401: a reader told
    // "your session has ended" on the sign-in screen is told about a session
    // they never had, and a reader told "that password is wrong" is sent
    // looking for a typo instead of a CAPTCHA.
    code: "captchaRequired",
    phrases: ["captcha verification required"],
  },
  { code: "emailInUse", phrases: ["email already exists"] },
  { code: "usernameInUse", phrases: ["username already exists"] },
  { code: "emailNotVerified", phrases: ["email must be verified before upgrading"] },
  { code: "accountDisabled", phrases: ["account has been disabled"] },
  { code: "accountBanned", phrases: ["account has been banned"] },
  { code: "invalidResetToken", phrases: ["invalid or expired reset token"] },
  {
    code: "sessionExpired",
    phrases: [
      // The three sentences the API answers an expired or revoked session with.
      "invalid or expired token",
      "no token provided",
      "invalid session",
      "session has been revoked",
      "please log in again",
      "invalid refresh token",
      "refresh token is required",
      "refresh token has been revoked",
      "unauthorized",
    ],
  },
  {
    code: "paymentUnavailable",
    phrases: ["payment gateway is unavailable", "no checkout url was created"],
    onServerFault: true,
  },
  { code: "paymentDeclined", phrases: ["payment gateway refused"] },
  {
    code: "rateLimited",
    phrases: ["too many failed attempts", "try again after", "too many requests", "rate limit", "try again later"],
  },
  { code: "notFound", phrases: ["not found"] },
  {
    code: "forbidden",
    phrases: [
      "insufficient permissions",
      "insufficient admin privileges",
      "access denied",
      "you do not have access to",
      "requires a higher role",
    ],
  },
  {
    code: "conflict",
    phrases: [
      "already exist",
      "already published",
      "already archived",
      "already verified",
      "already own",
      "already have",
      "already in library",
      "already linked",
      "already following",
      "already voted",
      "already submitted",
      "already on rental",
    ],
  },
];

/**
 * The status the server answered with, when the failure carries one.
 *
 * A failure that came from the network has no status: the request never
 * reached the server. A failure that came from the schema check has none
 * either: the server answered 200 and the BODY was wrong, which is the
 * server's contract breaking, not a status.
 */
export function statusOf(error: unknown): number | undefined {
  if (error instanceof ApiError) return error.status;
  return undefined;
}

/**
 * Whether the failure ended the session the request was made with.
 *
 * THE ONE RULE. The API client decides it — a refused sign-in does not end a
 * session, every other 401 does — and it records the verdict on the error.
 * Every layer that needs to know reads this, so the announcement ("the session
 * is gone") and the decision ("the reader is signed out") can never disagree.
 */
export function endsSession(error: unknown): boolean {
  if (error instanceof ApiError) return error.endsSession;
  return false;
}

/** The text of a thrown value, whatever it is. */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

/**
 * The code an HTTP status means, when the wording did not say.
 *
 * Only the statuses whose meaning is the SAME for every endpoint are listed.
 * A 401 is not one of them — a 401 on the sign-in screen is a wrong password
 * and a 401 on a protected page is a session that ended — so a 401 is resolved
 * by the wording first and falls back to "sessionExpired" only when the
 * wording said nothing the client knows.
 */
const STATUS_CODES: Readonly<Record<number, AppErrorCode>> = {
  400: "validation",
  401: "sessionExpired",
  402: "paymentDeclined",
  403: "forbidden",
  404: "notFound",
  409: "conflict",
  415: "validation",
  422: "validation",
  429: "rateLimited",
};

/**
 * The code for a failed `fetch` is a `TypeError` with a browser-specific
 * message, so it is recognised by its TYPE rather than its text: that is the
 * offline case, and "Failed to fetch" is the one message every browser agrees
 * on.
 *
 * THE ORDER: the status first for a server fault, then the wording, then the
 * status again, then the shape of the message.
 *
 * The wording is more precise than the status — "Email already exists" is a
 * 409, and the reader deserves to be told that their email is taken rather
 * than that "this already exists" — and the status is more reliable than the
 * wording, because the server may word a fact this client has never heard. So
 * the wording is asked first, and the status answers when the wording is
 * silent.
 *
 * THE SERVER FAULT IS ASKED FIRST, AND THIS IS THE PART THAT WAS WRONG. The
 * wording loop used to run before the status, and the comment under the status
 * block claimed the opposite: "a 5xx is the server's problem, whatever it said
 * about it". It was not what the code did. A 500 that carried the sentence
 * "Story not found" was classified as `notFound`, and a 503 that carried
 * "Payment method declined" was classified as `paymentDeclined` — so a broken
 * server was told to the reader as "that does not exist" and "the payment was
 * declined". A 5xx is now decided before the wording, with the single
 * exception of a rule that explains the fault in a way the reader can act on
 * (`paymentUnavailable`).
 */
export function classifyError(error: unknown): AppErrorCode {
  if (error instanceof TypeError && /fetch|network/i.test(messageOf(error))) {
    return "network";
  }

  const message = messageOf(error).toLowerCase();
  const status = statusOf(error);
  const isServerFault = status !== undefined && status >= 500;

  if (isServerFault) {
    // The server's own problem — unless it explained itself in a way the
    // reader can act on.
    for (const rule of RULES) {
      if (!rule.onServerFault) continue;
      if (rule.phrases.some((phrase) => message.includes(phrase))) return rule.code;
    }
    return "server";
  }

  if (message.length > 0) {
    for (const rule of RULES) {
      if (rule.phrases.some((phrase) => message.includes(phrase))) return rule.code;
    }
  }

  if (status !== undefined) {
    const byStatus = STATUS_CODES[status];
    if (byStatus) return byStatus;
  }

  // A 5xx that reached the reader as a message is the server's problem, not
  // theirs; anything else is unknown.
  if (/\b5\d\d\b|internal server error|service unavailable/.test(message)) return "server";

  return "unknown";
}

/**
 * The code for a failed SIGN-IN.
 *
 * WHY A SIGN-IN NEEDS ITS OWN VERDICT. A 401 on the sign-in screen means one
 * thing only: the email and the password did not match. The same status on a
 * protected page means the opposite — the session ended — and the generic
 * classifier has to choose between them from the wording alone. When the
 * wording is one this client does not know, the sign-in screen would otherwise
 * tell a reader whose password was wrong that "your session has ended", which
 * is a sentence about a session they never had.
 *
 * So the sign-in screen asks this instead: a 401 there is bad credentials,
 * whatever it said — with the exceptions this client DOES know, which are
 * checked first: a sign-in that is waiting for a CAPTCHA, and an account the
 * server will never let in. Both are facts about the sign-in, and both are
 * facts the reader can be told instead of "that password is wrong".
 */
export function classifySignInError(error: unknown): AppErrorCode {
  const code = classifyError(error);
  if (code === "captchaRequired") return code;
  if (code === "accountDisabled" || code === "accountBanned") return code;
  if (code === "rateLimited") return code;
  if (code === "sessionExpired" && statusOf(error) === 401) return "invalidCredentials";
  return code;
}

/**
 * The sentence for a failure, in the reader's language.
 *
 * The server's own wording is never shown: it is a fact about the system, and
 * it arrives in English inside an interface that may be Arabic. The failure is
 * CLASSIFIED and the code is looked up in the dictionary.
 *
 * The caller's own sentence is used for the one code that means "something
 * nobody has a name for" — the screen knows better than the shared dictionary
 * what its own failure is about ("couldn't send the reset link").
 */
export function readerMessage(
  error: unknown,
  dictionary: Readonly<Record<AppErrorCode, string>>,
  fallback: string,
): string {
  const code = classifyError(error);
  if (code === "unknown") return fallback;
  return dictionary[code];
}
