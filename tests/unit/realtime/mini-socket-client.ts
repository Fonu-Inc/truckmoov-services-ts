const PATH = '/realtime/socket.io/?EIO=4&transport=websocket';

export type Received = { event: string; payload: unknown };

/**
 * A minimal socket.io v4 client over the platform WebSocket, for in-process
 * tests only. Speaks just enough of the protocol: connect with auth, emit with
 * ack, receive events.
 */
export class MiniSocketClient {
  readonly events: Received[] = [];
  connectError: string | null = null;
  connected = false;
  closed = false;
  private readonly acks = new Map<number, (value: unknown) => void>();
  private readonly waiters: Array<() => void> = [];
  private nextAck = 1;

  private constructor(
    private readonly ws: WebSocket,
    private readonly namespace: string,
  ) {
    ws.addEventListener('message', (message) => this.onFrame(String(message.data)));
    ws.addEventListener('close', () => {
      this.closed = true;
      this.wake();
    });
  }

  static async open(port: number, namespace: string, token: string | undefined): Promise<MiniSocketClient> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${PATH}`);
    const client = new MiniSocketClient(ws, namespace);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', () => reject(new Error('socket error')));
    });
    ws.send(`40${namespace},${JSON.stringify(token ? { token } : {})}`);
    await client.until(() => client.connected || client.connectError !== null || client.closed);
    return client;
  }

  emit(event: string, payload: unknown): Promise<unknown> {
    if (!this.connected) return Promise.reject(new Error('not connected'));
    const id = this.nextAck++;
    return new Promise((resolve) => {
      this.acks.set(id, resolve);
      this.ws.send(`42${this.namespace},${id}${JSON.stringify([event, payload])}`);
    });
  }

  async next(event: string): Promise<unknown> {
    await this.until(() => this.events.some((item) => item.event === event));
    return this.events.find((item) => item.event === event)?.payload;
  }

  async until(done: () => boolean, timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!done()) {
      if (Date.now() > deadline) throw new Error('timed out');
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 25);
      });
    }
  }

  close(): void {
    this.ws.close();
  }

  private onFrame(frame: string): void {
    if (frame === '2') {
      this.ws.send('3');
      return;
    }
    if (frame.startsWith('40')) this.connected = true;
    if (frame.startsWith('44')) {
      this.connectError = (JSON.parse(frame.slice(frame.indexOf(',') + 1)) as { message: string }).message;
    }
    if (frame.startsWith('42')) this.onEvent(frame);
    if (frame.startsWith('43')) this.onAck(frame);
    this.wake();
  }

  private onEvent(frame: string): void {
    const body = frame.slice(frame.indexOf(',') + 1);
    const [event, payload] = JSON.parse(body) as [string, unknown];
    this.events.push({ event, payload });
  }

  private onAck(frame: string): void {
    const rest = frame.slice(frame.indexOf(',') + 1);
    const at = rest.indexOf('[');
    const id = Number(rest.slice(0, at));
    const [value] = JSON.parse(rest.slice(at)) as [unknown];
    this.acks.get(id)?.(value);
    this.acks.delete(id);
  }

  private wake(): void {
    for (const resolve of this.waiters.splice(0)) resolve();
  }
}
