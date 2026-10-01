export const NAMESPACE = '/platform-messaging';
export const ROOM = 'platform:messaging';

export const PERMISSION_READ = 'admin.messaging.read';
export const PERMISSION_MANAGE = 'admin.messaging.manage';

export const SEND_REQUESTED_SUBJECT = 'tm.system.messaging.send.requested';
export const READ_REQUESTED_SUBJECT = 'tm.system.messaging.read.requested';

export const EVENT_SUBJECTS: Readonly<Record<string, string>> = {
  'tm.system.messaging.message.created': 'message.created',
  'tm.system.messaging.message.status': 'message.status',
  'tm.system.messaging.conversation.updated': 'conversation.updated',
};

export type ErrorCode =
  | 'invalid_payload'
  | 'unauthenticated'
  | 'forbidden'
  | 'rate_limited'
  | 'conversation_not_found'
  | 'window_locked'
  | 'send_failed'
  | 'unavailable';

export type Ack<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: { code: ErrorCode; message: string } };

export type SendPayload = { client_message_id: string; conversation_id: string; text: string };
export type ReadPayload = { conversation_id: string };

const ERROR_TEXT: Record<ErrorCode, string> = {
  invalid_payload: 'The request is not valid.',
  unauthenticated: 'Sign in again.',
  forbidden: 'You do not have permission to do this.',
  rate_limited: 'Too many requests. Try again in a moment.',
  conversation_not_found: 'Conversation not found.',
  window_locked: 'The 24-hour window has closed.',
  send_failed: 'The message could not be sent.',
  unavailable: 'Messaging is unavailable right now.',
};

export function fail(code: ErrorCode): Ack<never> {
  return { ok: false, error: { code, message: ERROR_TEXT[code] } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ID_LENGTH = 128;
export const MAX_TEXT_LENGTH = 4096;
const DISALLOWED_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function conversationId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return id.length > 0 && id.length <= MAX_ID_LENGTH ? id : null;
}

export function parseSend(raw: unknown): SendPayload | null {
  if (!isRecord(raw)) return null;
  const id = conversationId(raw.conversation_id);
  const clientId = raw.client_message_id;
  if (!id || typeof clientId !== 'string' || !UUID.test(clientId)) return null;
  if (typeof raw.text !== 'string') return null;
  const text = raw.text.trim();
  if (text.length < 1 || text.length > MAX_TEXT_LENGTH || DISALLOWED_CONTROL.test(text)) return null;
  return { client_message_id: clientId, conversation_id: id, text };
}

export function parseRead(raw: unknown): ReadPayload | null {
  if (!isRecord(raw)) return null;
  const id = conversationId(raw.conversation_id);
  return id ? { conversation_id: id } : null;
}
