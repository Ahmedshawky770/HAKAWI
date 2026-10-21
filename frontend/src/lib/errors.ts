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
 */

export const APP_ERROR_CODES = [
  "invalidCredentials",
  "emailInUse",
  "usernameInUse",
  "emailNotVerified",
  "accountDisabled",
  "accountBanned",
  "invalidResetToken",
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
 * The error the API client throws.
 *
 * WHY IT IS A CLASS AND NOT A PLAIN `Error`. Two facts have to travel with a
 * failure: what the server SAID, and what the server ANSWERED with. The
 * message alone was not enough — it is the wording that changes with the
 * server's copy, and the wording is what the classifier has to guess from. The
 * status is the part that does not change: a 401 is a 401 whether the server
 * called it "Invalid or expired token" or "No token provided".
 *
 * It extends `Error`, so every existing `catch` that reads `error.message` and
 * every `instanceof Error` check keeps working; the status is an addition, not
 * a replacement.
 */
export class ApiError extends Error {
  /** The HTTP status the server answered with. */
  readonly status: number;
  /** The per-field details the server sent, when it sent any. */
  readonly details: readonly string[];

  constructor(message: string, status: number, details: readonly string[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
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
 * checked against every `throw new *Exception("…")` in `backend/src`, so that a
 * phrase is never a guess: a phrase the server does not send teaches the client
 * to recognise nothing, and a sentence the server DOES send that is missing
 * from this table teaches it to call a real failure "unknown".
 */
const RULES: readonly { code: AppErrorCode; phrases: readonly string[] }[] = [
  { code: "invalidCredentials", phrases: ["invalid email or password", "invalid credentials"] },
  { code: "emailInUse", phrases: ["email already exists", "email already registered", "email is already registered"] },
  { code: "usernameInUse", phrases: ["username already exists", "username is taken", "username already registered"] },
  { code: "emailNotVerified", phrases: ["email not verified", "verify your email", "email is not verified"] },
  { code: "accountDisabled", phrases: ["account has been disabled", "account is disabled"] },
  { code: "accountBanned", phrases: ["account has been banned", "account is banned"] },
  { code: "invalidResetToken", phrases: ["invalid or expired reset token", "invalid reset token", "reset token is invalid"] },
  {
    code: "sessionExpired",
    phrases: [
      "session has been revoked",
      "please log in again",
      "invalid session",
      "no token provided",
      "unauthorized",
      // The three sentences the API answers an expired or revoked session with.
      "invalid or expired token",
      "invalid refresh token",
      "refresh token is required",
      "refresh token has been revoked",
      "token expired",
    ],
  },
  { code: "paymentDeclined", phrases: ["payment method declined", "card was declined", "transaction declined", "payment declined"] },
  { code: "paymentUnavailable", phrases: ["payment gateway is unavailable", "no checkout url was created", "gateway is unavailable"] },
  {
    code: "rateLimited",
    phrases: ["too many requests", "rate limit", "try again later", "too many failed attempts", "try again after"],
  },
  { code: "notFound", phrases: ["not found", "does not exist", "no longer exists"] },
  { code: "forbidden", phrases: ["forbidden", "not allowed", "insufficient", "requires a higher role"] },
  { code: "conflict", phrases: ["already own", "already have", "already exists", "already published"] },
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
  403: "forbidden",
  404: "notFound",
  409: "conflict",
  415: "validation",
  422: "validation",
  429: "rateLimited",
};

/**
 * The code for a thrown value.
 *
 * A failed `fetch` is a `TypeError` with a browser-specific message, so it is
 * recognised by its TYPE rather than its text: that is the offline case, and
 * "Failed to fetch" is the one message every browser agrees on.
 *
 * THE ORDER: the wording first, then the status, then the shape of the
 * message. The wording is more precise than the status — "Email already
 * exists" is a 409, and the reader deserves to be told that their email is
 * taken rather than that "this already exists" — and the status is more
 * reliable than the wording, because the server may word a fact this client
 * has never heard. So the wording is asked first, and the status answers when
 * the wording is silent.
 */
export function classifyError(error: unknown): AppErrorCode {
  if (error instanceof TypeError && /fetch|network/i.test(messageOf(error))) {
    return "network";
  }

  const message = messageOf(error).toLowerCase();
  const status = statusOf(error);

  if (message.length > 0) {
    for (const rule of RULES) {
      if (rule.phrases.some((phrase) => message.includes(phrase))) return rule.code;
    }
  }

  if (status !== undefined) {
    // A 5xx is the server's problem, whatever it said about it.
    if (status >= 500) return "server";
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
 * whatever it said.
 */
export function classifySignInError(error: unknown): AppErrorCode {
  const code = classifyError(error);
  if (code === "sessionExpired" && statusOf(error) === 401) return "invalidCredentials";
  return code;
}
