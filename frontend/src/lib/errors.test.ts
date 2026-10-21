import { describe, expect, it } from "vitest";

import { APP_ERROR_CODES, ApiError, classifyError, classifySignInError, statusOf } from "@/lib/errors";

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
    expect(classifyError(new Error("Email already exists"))).toBe("emailInUse");
    expect(classifyError(new Error("Email already registered"))).toBe("emailInUse");
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
    expect(classifyError(new Error("Payment method declined"))).toBe("paymentDeclined");
    expect(classifyError(new Error("The payment gateway is unavailable"))).toBe("paymentUnavailable");
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
