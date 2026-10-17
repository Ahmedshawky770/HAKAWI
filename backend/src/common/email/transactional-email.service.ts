import { Inject, Injectable } from '@nestjs/common';

import { WinstonLoggerService } from '../services/winston-logger.service.ts';

import { EMAIL_TRANSPORTER, resolveEmailFromAddress, type EmailTransporter } from './email-transporter.interface.ts';

/**
 * What actually happened when a mail was requested.
 *
 * The three states are separated because the caller's contract to its user depends on which one it
 * got, and the bug this replaces merged them: `resend-verification` answered `'Verification email
 * sent'` while sending nothing at all. `not-configured` and `failed` are BOTH "no mail was sent",
 * but only one of them is fixable by the caller's user retrying.
 *
 * `sent` is returned when the transport accepted the message. The SMTP server can still reject the
 * recipient asynchronously; that is the transport's business and it reports it as a rejection here.
 */
export type TransactionalEmailOutcome =
  | { readonly status: 'sent'; readonly to: string }
  | { readonly status: 'not-configured'; readonly to: string }
  | { readonly status: 'failed'; readonly to: string; readonly reason: string };

export interface TransactionalEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * THE SINGLE SENDER FOR MAIL THAT CARRIES A SECRET.
 *
 * WHY A SERVICE AND NOT A DIRECT CALL TO THE TRANSPORTER. Every mail that carries a verification or
 * reset token needs the same four things done around the send: resolve the from address, decide
 * whether the transport can send at all, classify the failure, and log it without ever writing the
 * body. The body contains the token. Doing that in three modules meant three chances to get the
 * logging wrong and one chance to swallow the error into a 500.
 *
 * WHY IT NEVER THROWS. Sending is a side effect (Principle #14: AP is the default). An SMTP outage
 * must not turn a password reset into a 500, and it must not turn a successful registration into a
 * failed one. The caller gets an outcome and decides what to say; the service's job is to have
 * attempted the send and to have logged the reason it did not arrive.
 *
 * WHY THE BODY IS NEVER LOGGED. The `text` and `html` of these mails contain a live verification or
 * reset token. Winston output is aggregated, shipped and retained, so a body in a log line is a
 * credential leak with a very long half-life. Only the recipient and the subject are logged — both
 * are already present in the request being handled — and the failure reason is the transport's own
 * message, which names the SMTP fault, not the message it refused.
 */
@Injectable()
export class TransactionalEmailService {
  constructor(
    @Inject(EMAIL_TRANSPORTER) private readonly transporter: EmailTransporter,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {}

  async send(options: TransactionalEmailInput): Promise<TransactionalEmailOutcome> {
    if (!this.transporter.isConfigured()) {
      // The request still succeeds — the token is minted and stored — but the caller must not tell
      // its user a mail was sent. See the module README for the exact wording each endpoint returns.
      this.logger.warn(
        `Transactional email NOT sent to ${options.to} ("${options.subject}"): no email transporter is configured`,
        'TransactionalEmailService',
      );
      return { status: 'not-configured', to: options.to };
    }

    let result: { accepted: string[]; rejected: string[] };
    try {
      result = await this.transporter.sendMail({
        from: resolveEmailFromAddress(),
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Transactional email FAILED for ${options.to} ("${options.subject}"): ${reason}`,
        error instanceof Error ? error.stack : undefined,
        'TransactionalEmailService',
      );
      return { status: 'failed', to: options.to, reason };
    }

    if (result.rejected.length > 0) {
      // `sendMail` resolved but the server refused the recipient. Treating that as `sent` would be
      // the same lie the resend endpoint used to tell, just one layer deeper.
      const reason = `recipient rejected by the mail server: ${result.rejected.join(', ')}`;
      this.logger.warn(
        `Transactional email REFUSED for ${options.to} ("${options.subject}"): ${reason}`,
        'TransactionalEmailService',
      );
      return { status: 'failed', to: options.to, reason };
    }

    this.logger.info(`Transactional email sent to ${options.to} ("${options.subject}")`, 'TransactionalEmailService');
    return { status: 'sent', to: options.to };
  }
}
