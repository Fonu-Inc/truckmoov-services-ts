export const MAIL_TRANSPORT = Symbol("MAIL_TRANSPORT");

export type MailMessage = {
  to: string;
  subject: string;
  body: string;
};

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}
