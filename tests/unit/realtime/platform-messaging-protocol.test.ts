import { describe, expect, it } from 'vitest';
import { parseSend } from '../../../apps/realtime/src/platform-messaging/protocol';

const CLIENT_ID = '3f0c6c1e-8f0a-4a63-9d53-0c3b3f6f2a11';
const send = (text: string) => parseSend({ client_message_id: CLIENT_ID, conversation_id: 'c', text });

describe('parseSend control characters', () => {
  it('rejects NUL, which Postgres cannot store', () => {
    expect(send('a\u0000b')).toBeNull();
  });

  it('rejects other control characters', () => {
    expect(send('bell\u0007')).toBeNull();
    expect(send('del\u007f')).toBeNull();
  });

  it('keeps newlines, carriage returns and tabs', () => {
    expect(send('one\r\n\ttwo')?.text).toBe('one\r\n\ttwo');
  });
});
