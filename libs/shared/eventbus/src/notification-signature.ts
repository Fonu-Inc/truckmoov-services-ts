import { createHmac } from "node:crypto";
import type { EventEnvelope } from "./event-envelope";

const SEPARATOR = "\u001f";

/**
 * Proves a notification.send event came from a service holding the signing
 * secret. The tenant is signed in, so the subject cannot be rewritten to bill
 * another tenant. Must match notification.SignatureFor in the Go service.
 */
export function notificationSignature(secret: string, envelope: EventEnvelope): string {
  const data = envelope.data as Record<string, unknown>;
  const text = (key: string) => (typeof data[key] === "string" ? (data[key] as string) : "");
  const payload = [
    "notification.send.v1",
    envelope.tenant_id,
    envelope.id,
    text("channel"),
    text("recipient"),
    text("notification_type"),
    text("content"),
  ].join(SEPARATOR);
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function signNotification<T extends EventEnvelope>(secret: string, envelope: T): T & { sig: string } {
  return { ...envelope, sig: notificationSignature(secret, envelope) };
}
