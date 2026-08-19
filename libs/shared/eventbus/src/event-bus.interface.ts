import type { EventEnvelope } from "./event-envelope";

export interface EventBus {
  publish<TData extends Record<string, unknown>>(
    subject: string,
    envelope: EventEnvelope<TData>,
  ): Promise<void>;
  subscribe(
    subject: string,
    handler: (envelope: EventEnvelope) => Promise<void>,
  ): Promise<() => Promise<void>>;
  isReady(): Promise<boolean>;
}

export const EVENT_BUS = Symbol("EVENT_BUS");
