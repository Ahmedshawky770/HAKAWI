export interface EmailTransporter {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<{ accepted: string[]; rejected: string[]; pending: string[]; envelope: { from: string; to: string[] } }>;
}
