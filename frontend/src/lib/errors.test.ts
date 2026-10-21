import { describe, expect, it } from "vitest";

import { APP_ERROR_CODES, ApiError, classifyError, classifySignInError, endsSession, statusOf } from "@/lib/errors";

/**
 * THE SENTENCES THE SERVER ACTUALLY SENDS.
 *
 * Every phrase in this file was read out of `backend/src` — from the
 * `throw new *Exception("…")` calls themselves. A phrase the server does not
 * send teaches the client to recognise nothing, and a sentence the server DOES
 * send that is missing from the table teaches it to call a real failure
 * "unknown". The two together are how a reader whose access token had simply
 * expired was told "something went wrong" instead of being sent to the sign-in
 * screen.
 */
describe("classifyError", () => {
  it("recognises a refused sign-in", () => {
    expect(classifyError(new Error("Invalid email or password"))).toBe("invalidCredentials");
    expect(classifyError(new Error("Invalid credentials"))).toBe("invalidCredentials");
  });

  it("recognises a duplicate account", () => {
    // The sentence the API actually sends (`backend/src/modules/users`).
    expect(classifyError(new Error("Email already exists"))).toBe("emailInUse");
  });

  it("recognises an account the reader cannot use", () => {
    expect(classifyError(new Error("Account has been disabled"))).toBe("accountDisabled");
    expect(classifyError(new Error("Account has been banned"))).toBe("accountBanned");
  });

  it("recognises a session that has ended", () => {
    expect(classifyError(new Error("Unauthorized"))).toBe("sessionExpired");
    expect(classifyError(new Error("Invalid session"))).toBe("sessionExpired");
    // The two sentences the API answers a request without a token with.
    expect(classifyError(new Error("No token provided"))).toBe("sessionExpired");
    expect(classifyError(new Error("Request failed (401): Unauthorized"))).toBe("sessionExpired");
  });

  /**
   * THE REGRESSION THIS FILE EXISTS FOR.
   *
   * `backend/src/common/guards/jwt-auth.guard.ts` answers an expired or
   * revoked access token with `UnauthorizedException('Invalid or expired
   * token')`. That sentence was NOT in the classifier's table, so an expired
   * token was not recognised as a lost session: the session guard sent the
   * reader to an error screen with a retry button instead of the sign-in
   * screen — and the retry could never succeed, because nothing refreshes the
   * token. The access token lives for fifteen minutes, so this was not an edge
   * case; it was what happened to every reader, every quarter of an hour.
   */
  it("recognises the sentence the server actually uses for an expired token", () => {
    expect(classifyError(new Error("Invalid or expired token"))).toBe("sessionExpired");
    expect(classifyError(new Error("Invalid refresh token"))).toBe("sessionExpired");
    expect(classifyError(new Error("Refresh token is required"))).toBe("sessionExpired");
    expect(classifyError(new Error("Refresh token has been revoked"))).toBe("sessionExpired");
  });

  it("recognises a payment the gateway refused", () => {
    // The sentence the API actually sends when the gateway refuses a refund
    // (`backend/src/modules/payments/payments.service.ts`).
    expect(classifyError(new Error("The payment gateway refused the refund, so it was not submitted"))).toBe(
      "paymentDeclined",
    );
    expect(classifyError(new Error("The payment gateway is unavailable"))).toBe("paymentUnavailable");
  });

  /**
   * THE SERVER FAULT IS DECIDED BEFORE THE WORDING.
   *
   * The wording used to be asked first, and the comment under the status block
   * claimed the opposite: "a 5xx is the server's problem, whatever it said
   * about it". It was not what the code did. A 500 that carried the sentence
   * "Story not found" was classified as `notFound`, so a broken server was
   * told to the reader as "that does not exist" — and a reader who then
   * looked for the book, and did not find it, was told the wrong thing twice.
   */
  it("calls a 5xx the server's problem whatever the server said about it", () => {
    expect(classifyError(new ApiError("Story not found", 500))).toBe("server");
    expect(classifyError(new ApiError("Invalid or expired token", 503))).toBe("server");
    expect(classifyError(new ApiError("Payment method declined", 502))).toBe("server");
  });

  /**
   * THE ONE 5xx THE READER CAN ACT ON.
   *
   * "The payment gateway is unavailable" is a 503 the server explained in a
   * way the reader can act on — try again shortly — so it keeps its own code
   * instead of being flattened into "something went wrong on our side".
   */
  it("keeps the actionable server fault its own code", () => {
    expect(
      classifyError(
        new ApiError("The payment gateway is unavailable, so no checkout URL was created: timeout", 503),
      ),
    ).toBe("paymentUnavailable");
  });

  /**
   * A SIGN-IN THAT IS WAITING FOR A CAPTCHA.
   *
   * The server refuses it with a 401 and this sentence
   * (`backend/src/modules/auth/auth.service.ts`). Told "that password is
   * wrong", the reader changes the password and is refused again.
   */
  it("recognises a sign-in that is waiting for a captcha", () => {
    expect(classifyError(new ApiError("CAPTCHA verification required", 401))).toBe("captchaRequired");
    expect(classifySignInError(new ApiError("CAPTCHA verification required", 401))).toBe("captchaRequired");
  });

  it("recognises a locked-out sign-in as a rate limit, not as a lost session", () => {
    // `backend/src/modules/auth/auth.service.ts` answers a locked-out sign-in
    // with a 401 and this sentence. A table that resolved the STATUS first
    // would have called it an expired session and told the reader so.
    expect(classifyError(new Error("Too many failed attempts. Please try again after 5 minutes."))).toBe(
      "rateLimited",
    );
  });

  it("recognises an offline browser by its type, not by its wording", () => {
    // Every browser words this differently; the TYPE is what they agree on.
    expect(classifyError(new TypeError("Failed to fetch"))).toBe("network");
    expect(classifyError(new TypeError("NetworkError when attempting to fetch resource."))).toBe("network");
  });

  it("falls back for a failure it does not know", () => {
    expect(classifyError(new Error("password"))).toBe("unknown");
    expect(classifyError(new Error(""))).toBe("unknown");
  });

  /**
   * THE STATUS IS THE RELIABLE HALF OF THE VERDICT.
   *
   * The wording is precise but the server may word a fact this client has
   * never heard; the status is blunt but it never changes. So a failure that
   * carries a status and a wording nobody knows is still classified, and it is
   * classified as what the status means.
   */
  it("falls back to the status when the wording is one it does not know", () => {
    expect(classifyError(new ApiError("Something nobody has seen before", 403))).toBe("forbidden");
    expect(classifyError(new ApiError("Gone", 404))).toBe("notFound");
    expect(classifyError(new ApiError("Already there", 409))).toBe("conflict");
    expect(classifyError(new ApiError("Slow down", 429))).toBe("rateLimited");
    expect(classifyError(new ApiError("Bad input", 400))).toBe("validation");
    expect(classifyError(new ApiError("Boom", 500))).toBe("server");
    expect(classifyError(new ApiError("Boom", 503))).toBe("server");
  });

  it("lets a known wording beat a status that would say something else", () => {
    // A 409 that says the email is taken is more precise than "conflict",
    // and a reader deserves to be told that their email is taken.
    expect(classifyError(new ApiError("Email already exists", 409))).toBe("emailInUse");
    // A 403 that says the account is disabled is more precise than "forbidden".
    expect(classifyError(new ApiError("Account has been disabled", 403))).toBe("accountDisabled");
  });

  it("reads the status off the error it carries", () => {
    expect(statusOf(new ApiError("Unauthorized", 401))).toBe(401);
    expect(statusOf(new Error("Unauthorized"))).toBeUndefined();
    expect(statusOf("Unauthorized")).toBeUndefined();
  });
});

describe("classifySignInError", () => {
  it("reads every refusal on the sign-in screen as bad credentials", () => {
    // The server's own sentence.
    expect(classifySignInError(new ApiError("Invalid email or password", 401))).toBe("invalidCredentials");
    // A refusal this client has never heard of: on the sign-in screen a 401
    // can only mean the email and the password did not match.
    expect(classifySignInError(new ApiError("Whatever it was", 401))).toBe("invalidCredentials");
  });

  it("does not turn every refusal into bad credentials", () => {
    expect(classifySignInError(new ApiError("Email already exists", 409))).toBe("emailInUse");
    expect(classifySignInError(new ApiError("Account has been disabled", 403))).toBe("accountDisabled");
    expect(classifySignInError(new ApiError("Too many failed attempts. Please try again after 5 minutes.", 401))).toBe(
      "rateLimited",
    );
    expect(classifySignInError(new TypeError("Failed to fetch"))).toBe("network");
  });

  /**
   * THE REFUSALS THE SIGN-IN SCREEN KNOWS ARE NOT ABOUT THE PASSWORD.
   *
   * "A 401 on this screen can only mean the email and the password did not
   * match" was the premise, and it was false: the server also refuses a
   * sign-in that is waiting for a CAPTCHA, and it refuses the sign-in of an
   * account it will never let in. Both are facts the reader must be told
   * instead of being sent to check their password again.
   */
  it("keeps the sign-in refusals that are not about the password", () => {
    expect(classifySignInError(new ApiError("CAPTCHA verification required", 401))).toBe("captchaRequired");
    expect(classifySignInError(new ApiError("Account has been disabled", 401))).toBe("accountDisabled");
    expect(classifySignInError(new ApiError("Account has been banned", 403))).toBe("accountBanned");
  });
});

/**
 * THE VERDICT ON THE SESSION, AND THE ONE RULE THAT PRODUCES IT.
 *
 * Two layers used to decide independently whether a 401 had ended the session:
 * the API client announced the loss for EVERY 401, and the session guard asked
 * the classifier whether the failure was a `sessionExpired`. The two
 * disagreed, and a 401 the classifier read differently — "Account has been
 * disabled" — was announced as a lost session and then judged not to be one.
 */
describe("endsSession", () => {
  it("is the verdict the API client recorded, and nothing else", () => {
    expect(endsSession(new ApiError("Invalid or expired token", 401, { endsSession: true }))).toBe(true);
    expect(endsSession(new ApiError("Invalid email or password", 401, { endsSession: false }))).toBe(false);
    // A failure that is not an API error carries no verdict at all.
    expect(endsSession(new Error("Invalid or expired token"))).toBe(false);
    expect(endsSession(undefined)).toBe(false);
  });

  it("is NOT the same question as the classifier's code", () => {
    // A disabled account is a 401 the server words "Account has been
    // disabled". The classifier reads it as `accountDisabled`, and the
    // session is over — the two answers are about different questions, and
    // the guard has to read the session one.
    const disabled = new ApiError("Account has been disabled", 401, { endsSession: true });
    expect(classifyError(disabled)).toBe("accountDisabled");
    expect(endsSession(disabled)).toBe(true);
  });
});

describe("the code table and the dictionary", () => {
  it("never returns a code the dictionary does not have", () => {
    // The dictionary is `Record<AppErrorCode, string>` — a code that is not in
    // it is a compile error there. This is the runtime half of the same
    // guarantee: a code that is not in the table at all cannot be produced.
    const failures: unknown[] = [
      new Error("Invalid email or password"),
      new Error("Email already exists"),
      new Error("Unauthorized"),
      new Error("Invalid or expired token"),
      new Error("Account has been banned"),
      new Error("Payment method declined"),
      new TypeError("Failed to fetch"),
      new Error("something nobody has seen before"),
      new ApiError("Boom", 500),
    ];

    for (const failure of failures) {
      const code = classifyError(failure);
      expect(APP_ERROR_CODES).toContain(code);
      expect(code).not.toBe("");
    }
  });
});
