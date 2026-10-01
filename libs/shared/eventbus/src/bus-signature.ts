import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { canonicalJson } from "./canonical-json";
import type { EventEnvelope } from "./event-envelope";

const SEPARATOR = "\u001f";

export type BusVerdict =
  | { ok: true; signed: boolean }
  | { ok: false; reason: "secret_unset" | "bad_subject" | "tenant_mismatch" | "unsigned" | "bad_signature" };

export type BusMeta = { subject: string };
export type BusHandler = (envelope: EventEnvelope, meta: BusMeta) => Promise<void>;

function digest(value: unknown): string {
  const onTheWire = JSON.parse(JSON.stringify(value ?? {})) as unknown;
  return createHash("sha256").update(canonicalJson(onTheWire ?? {})).digest("hex");
}

/**
 * Covers subject, id, type, tenant, data and actor. occurred_at is not signed,
 * so a captured event can be replayed: consumers with side effects dedupe by id.
 * Must match BusSignature in the Go eventbus package.
 */
export function busSignature(secret: string, subject: string, envelope: EventEnvelope): string {
  const payload = [
    "bus.v2",
    subject,
    envelope.id,
    envelope.type,
    envelope.tenant_id,
    digest(envelope.data),
    digest(envelope.actor),
  ].join(SEPARATOR);
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function signBusEvent<T extends EventEnvelope>(secret: string, subject: string, envelope: T): T & { bsig: string } {
  return { ...envelope, bsig: busSignature(secret, subject, envelope) };
}

function subjectTenant(subject: string | undefined): string | null {
  const parts = (subject ?? "").split(".");
  if (parts.length < 3 || parts[0] !== "tm" || parts[1] === "") return null;
  return parts[1];
}

function signatureMatches(secret: string, subject: string, envelope: EventEnvelope): boolean {
  try {
    const expected = Buffer.from(busSignature(secret, subject, envelope));
    const given = Buffer.from(envelope.bsig ?? "");
    return expected.length === given.length && timingSafeEqual(expected, given);
  } catch {
    return false;
  }
}

/**
 * A present but wrong bsig is always refused. A missing one is only tolerated
 * while acceptUnsigned is set, which exists for the rollout and nothing else.
 */
export function verifyBusEvent(
  secret: string,
  subject: string,
  envelope: EventEnvelope,
  opts: { acceptUnsigned?: boolean } = {},
): BusVerdict {
  if (!secret) return { ok: false, reason: "secret_unset" };
  const tenant = subjectTenant(subject);
  if (tenant === null) return { ok: false, reason: "bad_subject" };
  if (envelope.tenant_id !== tenant) return { ok: false, reason: "tenant_mismatch" };
  if (!envelope.bsig) {
    return opts.acceptUnsigned ? { ok: true, signed: false } : { ok: false, reason: "unsigned" };
  }
  return signatureMatches(secret, subject, envelope)
    ? { ok: true, signed: true }
    : { ok: false, reason: "bad_signature" };
}

export type VerifiedHandlerOptions = {
  secret: string;
  acceptUnsigned?: boolean;
  logger: { warn(message: string): void; error?(message: string): void };
};

/** Rejected events are acknowledged, not retried: a forged event must not be redelivered forever. */
export function verifiedHandler(handler: BusHandler, options: VerifiedHandlerOptions): BusHandler {
  if (!options.secret) {
    const report = options.logger.error ?? options.logger.warn;
    report.call(options.logger, "event_signing_secret_unset: every verified event will be rejected");
  }
  return async (envelope, meta) => {
    const subject = meta?.subject ?? "";
    const verdict = verifyBusEvent(options.secret, subject, envelope, { acceptUnsigned: options.acceptUnsigned });
    if (!verdict.ok) {
      options.logger.warn(`event_rejected:${subject}:${verdict.reason}`);
      return;
    }
    if (!verdict.signed) options.logger.warn(`event_unsigned_accepted:${subject}`);
    await handler(envelope, meta);
  };
}
