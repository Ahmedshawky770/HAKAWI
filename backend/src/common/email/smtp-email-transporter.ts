import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

import { WinstonLoggerService } from '../services/winston-logger.service.ts';

import type { EmailTransporter } from './email-transporter.interface.ts';

/**
 * THE ONE SMTP CONFIGURATION IN THE CODEBASE.
 *
 * WHY THIS MOVED HERE. It used to sit in `modules/notifications/email/` and was registered by
 * `NotificationsModule`. `AuthModule` needs the same transport to deliver the password-reset code,
 * and dependency-rules.md forbids Auth → Notifications, so the alternative was a second SMTP
 * configuration with its own credentials, timeouts and pool — two transports that must be kept in
 * step for the rest of the project's life (Principle #9). The file moved to `common/email/` instead,
 * unchanged in behaviour; `CommonModule` provides it once and both the notifications email path and
 * the auth flows consume the same instance.
 *
 * `grep -r "nodemailer.createTransport" backend/src` must return exactly one hit. If it returns
 * more, someone has reintroduced the second configuration this move removed.
 *
 * WHY THE PROVIDER BINDING LIVES IN `CommonModule` AND NOT HERE. The provider is registered once in
 * the global module so a second registration cannot shadow it, and the class stays constructible with
 * plain `new` for unit tests.
 */
@Injectable()
export class SmtpEmailTransporter implements EmailTransporter {
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    private readonly configService: ConfigService,
    @Inject(WinstonLoggerService) private readonly logger: WinstonLoggerService,
  ) {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    const host = this.configService.get<string>('EMAIL_HOST');
    const port = this.configService.get<number>('EMAIL_PORT');
    const user = this.configService.get<string>('EMAIL_USER');
    const password = this.configService.get<string>('EMAIL_PASSWORD');
    const provider = this.configService.get<string>('EMAIL_PROVIDER');

    if (!host || !port || !user || !password) {
      // Transporter will remain null; sendMail will return rejected
      return;
    }

    const transportOptions: Record<string, unknown> = {
      host,
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: {
        user,
        pass: password,
      },
      // Connection pool for better performance
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      // Timeouts
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 30000,
    };

    // Provider-specific defaults
    if (provider === 'gmail') {
      transportOptions.service = 'gmail';
      transportOptions.auth = { user, pass: password };
    } else if (provider === 'sendgrid') {
      transportOptions.host = 'smtp.sendgrid.net';
      transportOptions.port = 587;
      transportOptions.auth = { user: 'apikey', pass: password };
    } else if (provider === 'mailgun') {
      transportOptions.host = 'smtp.mailgun.org';
      transportOptions.port = 587;
      transportOptions.auth = { user, pass: password };
    } else if (provider === 'ses') {
      transportOptions.host = `email-smtp.${this.configService.get<string>('AWS_REGION') || 'us-east-1'}.amazonaws.com`;
      transportOptions.port = 587;
      transportOptions.auth = { user, pass: password };
    }

    this.transporter = nodemailer.createTransport(transportOptions as nodemailer.TransportOptions);

    // Verify connection on startup
    this.transporter.verify((error) => {
      if (error) {
        this.logger.error(
          '[SmtpEmailTransporter] SMTP connection verification failed',
          error.message,
          'SmtpEmailTransporter',
        );
      } else {
        this.logger.info('[SmtpEmailTransporter] SMTP server is ready', 'SmtpEmailTransporter');
      }
    });
  }

  /**
   * Whether SMTP credentials were supplied at startup.
   *
   * A caller that sends anyway gets a thrown `Error` from `sendMail`, which merges "not configured"
   * with "the server refused". Reporting the configured case up front is what lets the auth flows
   * answer truthfully instead of claiming a mail was sent that was never attempted.
   */
  isConfigured(): boolean {
    return this.transporter !== null;
  }

  async sendMail(options: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<{ accepted: string[]; rejected: string[]; pending: string[]; envelope: { from: string; to: string[] } }> {
    if (!this.transporter) {
      throw new Error('No email transporter configured. Set EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASSWORD.');
    }

    const result = await this.transporter.sendMail({
      from: options.from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    return {
      accepted: result.accepted || [options.to],
      rejected: result.rejected || [],
      pending: result.pending || [],
      envelope: {
        from: result.envelope?.from || options.from,
        to: result.envelope?.to || [options.to],
      },
    };
  }

  async close(): Promise<void> {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
    }
  }
}
