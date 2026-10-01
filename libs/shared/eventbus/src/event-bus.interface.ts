import type { BusHandler } from "./bus-signature";
import type { EventEnvelope } from "./event-envelope";

export interface EventBus {
  publish<TData extends Record<string, unknown>>(
    subject: string,
    envelope: EventEnvelope<TData>,
  ): Promise<void>;
  /**
   * @param consumer Names this subscriber's own durable consumer.
   *
   * Two subscribers to the same subject WITHOUT distinct names share one
   * durable consumer. Delivery is then split between them: each message
   * reaches one handler and not the other. Pass a name whenever a subject has
   * more than one logical subscriber.
   */
  subscribe(
    subject: string,
    handler: BusHandler,
    consumer?: string,
  ): Promise<() => Promise<void>>;
  /**
   * Delivers every message to every running instance, not one of them, and
   * keeps nothing for an instance that was down: for dropping in-memory
   * caches, not for work that must happen once.
   */
  subscribeEveryInstance?(
    subject: string,
    handler: BusHandler,
  ): Promise<() => Promise<void>>;
  isReady(): Promise<boolean>;
}

export const EVENT_BUS = Symbol("EVENT_BUS");
