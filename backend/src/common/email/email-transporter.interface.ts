/**
 * THE ONE EMAIL TRANSPORT CONTRACT.
 *
 * WHY THIS MOVED OUT OF `modules/notifications/email/`. It used to live beside the SMTP
 * implementation that satisfied it, which made the interface unreachable from the modules that
 * actually need to send mail. `AuthService.forgotPassword` minted a reset token, stored it, emitted
 * a tokenless event and returned — nobody could ever receive the code, because the only transport in
 * the codebase was registered inside `NotificationsModule` and `AuthModule` may not depend on it
 * (dependency-rules.md: Auth may depend on Core, Users, Config only).
 *
 * `CommonModule` is `@Global()` and is the inward dependency every module already resolves through,
 * so the contract, its SMTP implementation and the provider all live there now. There is exactly ONE
 * transport and ONE SMTP configuration in the codebase (Principle #9): `SmtpEmailTransporter` moved
 * here verbatim, and `NotificationsModule` now consumes the shared instance instead of registering
 * its own.
 *
 * WHY `isConfigured()` IS PART OF THE CONTRACT. `sendMail` on an unconfigured transport throws a
 * generic `Error`, which left every caller with two indistinguishable failures: "SMTP is not set up"
 * (a permanent configuration gap) and "the SMTP server refused the message" (a transient outage).
 * Only the caller can decide what to tell its user, and it can only decide truthfully if it can ask
 * the question before it sends. That is why the question is on the interface and not sniffed from
 * an error message.
 */
export interface EmailTransporter {
  /**
   * False when the transport has no live credentials and therefore cannot send anything.
   *
   * Deliberately NOT an availability probe: it answers "is this transport configured", never
   * "is the SMTP server reachable". A false negative here would make a configured deployment
   * report every mail as unsent.
   */
  isConfigured(): boolean;

  sendMail(options: { from: string; to: string; subject: string; text: string; html?: string }): Promise<{
    accepted: string[];
    rejected: string[];
    pending: string[];
    envelope: { from: string; to: string[] };
  }>;
}

/** Injection token for {@link EmailTransporter}, so consumers depend on the contract, not the class. */
export const EMAIL_TRANSPORTER = Symbol('EMAIL_TRANSPORTER');

/**
 * The address every outbound mail comes from, resolved once.
 *
 * It used to be read independently by `NotificationsEmailService`, and the auth flows would have
 * needed a third copy. Two readers of one variable are one decision waiting to diverge
 * (Principle #9), so the read and its default live here.
 */
export const DEFAULT_EMAIL_FROM = 'noreply@hakawi.com';

export function resolveEmailFromAddress(): string {
  return process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM;
}
