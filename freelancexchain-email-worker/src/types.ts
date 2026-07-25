export interface EmailAttachmentMeta {
  filename: string;
  size: number;
  mimeType: string;
}

export interface InboundEmailPayload {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  attachments: EmailAttachmentMeta[];
  inReplyTo: string | null;
  references: string | null;
  receivedAt: string;
}

export interface Env {
  API_WEBHOOK_URL: string;
  WEBHOOK_SECRET: string;
}
