import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  busSignature,
  canonicalJson,
  signBusEvent,
  verifiedHandler,
  verifyBusEvent,
  type EventEnvelope,
} from "@shared/eventbus";

type VectorCase = {
  name: string;
  subject: string;
  envelope: EventEnvelope;
  canonical_data?: string;
  canonical_actor?: string;
  sig?: string;
  unsupported?: boolean;
};

const fixture = JSON.parse(
  readFileSync(join(__dirname, "../../../libs/shared/eventbus/src/bus-signature.vectors.json"), "utf8"),
) as { secret: string; cases: VectorCase[] };
const SECRET = fixture.secret;
const SUBJECT = "tm.acme.job.offer.created";

function envelope(over: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    id: "evt-1",
    type: "job.offer.created",
    version: 1,
    occurred_at: "2026-10-01T00:00:00Z",
    tenant_id: "acme",
    data: { offer_id: "o1", count: 2 },
    actor: { user_id: "u1" },
    ...over,
  };
}

describe("shared signature vectors", () => {
  for (const c of fixture.cases) {
    it(c.name, () => {
      if (c.unsupported) {
        expect(() => busSignature(SECRET, c.subject, c.envelope)).toThrow();
        return;
      }
      expect(canonicalJson(c.envelope.data)).toBe(c.canonical_data);
      expect(canonicalJson(c.envelope.actor ?? {})).toBe(c.canonical_actor);
      expect(busSignature(SECRET, c.subject, c.envelope)).toBe(c.sig);
    });
  }
});

describe("canonicalJson", () => {
  it("sorts keys by code point, not UTF-16 unit", () => {
    expect(canonicalJson({ "\u{1F600}": 1, "￿": 2 })).toBe('{"￿":2,"\u{1F600}":1}');
  });

  it("rejects values the Go side cannot reproduce", () => {
    for (const bad of [NaN, Infinity, 1e-7, 2 ** 53, 1e21, "\ud800", BigInt(1), () => 1]) {
      expect(() => canonicalJson({ v: bad })).toThrow();
    }
  });

  it("omits undefined members and writes -0 as 0", () => {
    expect(canonicalJson({ a: undefined, b: -0 })).toBe('{"b":0}');
  });
});

describe("verifyBusEvent", () => {
  const signed = () => signBusEvent(SECRET, SUBJECT, envelope());

  it("accepts a signed event", () => {
    expect(verifyBusEvent(SECRET, SUBJECT, signed())).toEqual({ ok: true, signed: true });
  });

  it("ignores a caller-supplied bsig when signing", () => {
    const forged = signBusEvent(SECRET, SUBJECT, { ...envelope(), bsig: "x" });
    expect(forged.bsig).toBe(busSignature(SECRET, SUBJECT, envelope()));
  });

  it.each([
    ["data", { data: { offer_id: "o2", count: 2 } }],
    ["actor", { actor: { user_id: "u2" } }],
    ["id", { id: "evt-2" }],
    ["type", { type: "job.offer.responded" }],
  ])("rejects a tampered %s", (_name, change) => {
    const verdict = verifyBusEvent(SECRET, SUBJECT, { ...signed(), ...change });
    expect(verdict).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a valid event replayed on another subject", () => {
    const verdict = verifyBusEvent(SECRET, "tm.acme.job.offer.responded", signed());
    expect(verdict).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects an envelope tenant that differs from the subject tenant", () => {
    const forged = signBusEvent(SECRET, "tm.other.job.offer.created", envelope());
    expect(verifyBusEvent(SECRET, "tm.other.job.offer.created", forged)).toEqual({
      ok: false,
      reason: "tenant_mismatch",
    });
  });

  it.each(["tm.acme", "x.acme.a.b", "tm..a.b", ""])("rejects subject %j", (subject) => {
    expect(verifyBusEvent(SECRET, subject, signed())).toEqual({ ok: false, reason: "bad_subject" });
  });

  it("rejects when the secret is unset", () => {
    expect(verifyBusEvent("", SUBJECT, signed())).toEqual({ ok: false, reason: "secret_unset" });
  });

  it("rejects a wrong secret", () => {
    expect(verifyBusEvent("other", SUBJECT, signed())).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects unsigned unless the rollout flag is set", () => {
    expect(verifyBusEvent(SECRET, SUBJECT, envelope())).toEqual({ ok: false, reason: "unsigned" });
    expect(verifyBusEvent(SECRET, SUBJECT, envelope(), { acceptUnsigned: true })).toEqual({
      ok: true,
      signed: false,
    });
  });

  it("rejects a wrong bsig even with the rollout flag", () => {
    const verdict = verifyBusEvent(SECRET, SUBJECT, { ...envelope(), bsig: "0".repeat(64) }, { acceptUnsigned: true });
    expect(verdict).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("does not accept the notification.send sig as a bus signature", () => {
    const verdict = verifyBusEvent(SECRET, SUBJECT, { ...envelope(), sig: "abc" });
    expect(verdict).toEqual({ ok: false, reason: "unsigned" });
  });
});

describe("verifiedHandler", () => {
  const logger = () => ({ warn: vi.fn(), error: vi.fn() });

  it("runs the handler for a signed event", async () => {
    const handler = vi.fn();
    const log = logger();
    await verifiedHandler(handler, { secret: SECRET, logger: log })(signBusEvent(SECRET, SUBJECT, envelope()), { subject: SUBJECT });
    expect(handler).toHaveBeenCalledOnce();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("drops a forged event, logs once and resolves so it is acked", async () => {
    const handler = vi.fn();
    const log = logger();
    await expect(
      verifiedHandler(handler, { secret: SECRET, logger: log })(envelope(), { subject: SUBJECT }),
    ).resolves.toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith(`event_rejected:${SUBJECT}:unsigned`);
  });

  it("accepts unsigned with the flag and logs it", async () => {
    const handler = vi.fn();
    const log = logger();
    await verifiedHandler(handler, { secret: SECRET, acceptUnsigned: true, logger: log })(envelope(), { subject: SUBJECT });
    expect(handler).toHaveBeenCalledOnce();
    expect(log.warn).toHaveBeenCalledWith(`event_unsigned_accepted:${SUBJECT}`);
  });

  it("still rejects a wrong signature with the flag set", async () => {
    const handler = vi.fn();
    const tampered = { ...signBusEvent(SECRET, SUBJECT, envelope()), data: { offer_id: "x" } };
    await verifiedHandler(handler, { secret: SECRET, acceptUnsigned: true, logger: logger() })(tampered, { subject: SUBJECT });
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects everything and reports at error level when the secret is unset", async () => {
    const handler = vi.fn();
    const log = logger();
    const wrapped = verifiedHandler(handler, { secret: "", acceptUnsigned: true, logger: log });
    await wrapped(envelope(), { subject: SUBJECT });
    expect(handler).not.toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining("event_signing_secret_unset"));
  });

  it("rejects when the delivery carries no subject", async () => {
    const handler = vi.fn();
    await verifiedHandler(handler, { secret: SECRET, logger: logger() })(signBusEvent(SECRET, SUBJECT, envelope()), undefined as never);
    expect(handler).not.toHaveBeenCalled();
  });
});
