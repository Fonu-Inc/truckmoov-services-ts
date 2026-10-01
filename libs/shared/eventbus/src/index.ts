export type { EventEnvelope } from "./event-envelope";
export type { EventBus } from "./event-bus.interface";
export { EVENT_BUS } from "./event-bus.interface";
export { EventBusModule } from "./eventbus.module";
export { natsLogin, type NatsCredentials } from "./nats-jetstream.eventbus";
export { notificationSignature, signNotification } from "./notification-signature";
export { canonicalJson } from "./canonical-json";
export {
  busSignature,
  signBusEvent,
  verifyBusEvent,
  verifiedHandler,
  type BusHandler,
  type BusMeta,
  type BusVerdict,
  type VerifiedHandlerOptions,
} from "./bus-signature";
