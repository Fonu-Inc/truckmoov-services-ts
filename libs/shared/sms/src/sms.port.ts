export const SMS_TRANSPORT = Symbol("SMS_TRANSPORT");

export type SmsMessage = {
  to: string;
  body: string;
};

export interface SmsTransport {
  send(message: SmsMessage): Promise<void>;
}
