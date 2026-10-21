/**
 * THE SECOND FACTOR, AND HOW A REQUEST ASKS FOR IT.
 *
 * SOME ROUTES DEMAND A SECOND FACTOR. The API marks them with `@RequireMfa()`, and the guard
 * behind that marker refuses a caller who has an admin role unless the request carries a
 * `X-MFA-Token` header holding a TOTP code or a backup code. The routes are the financial ones,
 * the moderation ones, and the admin break-glass one.
 *
 * THE PROBLEM THIS MODULE SOLVES. A refusal arrives as an ordinary 401, and a 401 has always
 * meant "the session is over". If the client treated it that way, the reader would be thrown to
 * the sign-in screen for wanting to do something that needs a code from their phone — and their
 * session would be destroyed for it. So the refusal is recognised as what it is, the reader is
 * asked for the code, and the request is made again with it.
 *
 * WHY A REGISTRY AND NOT A CONTEXT. The API client is a plain module with no React in it, and it
 * must not grow one. So it asks whoever has registered a requester, and the interface — the
 * provider that owns the dialog — registers one. A client with no interface registered (a test, a
 * background script) is told there is no code to send, and the failure is reported as it is.
 */
type CodeRequester = () => Promise<string | null>;

let requester: CodeRequester | null = null;

/**
 * Register whoever asks the reader for the code.
 *
 * @param next the requester, or `null` to remove it.
 * @returns the function that removes it again, so a caller can take the registration
 *          back when it is finished with it.
 */
export function registerMfaCodeRequester(next: CodeRequester | null): () => void {
  requester = next;
  return () => {
    if (requester === next) requester = null;
  };
}

/**
 * Ask the reader for a second factor.
 *
 * @returns the code, or `null` when there is nobody to ask, the reader declined, or the
 *          interface could not show the prompt.
 */
export async function requestMfaCode(): Promise<string | null> {
  if (!requester) return null;
  return requester();
}

/**
 * The header the code travels in.
 *
 * The name is the API's, not ours: `MfaGuard` reads `x-mfa-token` off the request.
 */
export const MFA_TOKEN_HEADER = "X-MFA-Token";
