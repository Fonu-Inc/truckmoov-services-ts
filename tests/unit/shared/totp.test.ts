import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  TOTP_PERIOD_SECONDS,
  totpCodeAt,
  totpEnrolmentUri,
  verifyTotp,
} from "@shared/crypto";

// RFC 6238 test vector: the ASCII secret "12345678901234567890", SHA-1.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));

describe("TOTP against the RFC vectors", () => {
  it("produces the published codes at the published times", () => {
    expect(totpCodeAt(RFC_SECRET, 59 * 1000)).toBe("287082");
    expect(totpCodeAt(RFC_SECRET, 1111111109 * 1000)).toBe("081804");
    expect(totpCodeAt(RFC_SECRET, 1111111111 * 1000)).toBe("050471");
    expect(totpCodeAt(RFC_SECRET, 1234567890 * 1000)).toBe("005924");
  });

  // A counter past 2^32 is why the counter is written as two 32-bit halves
  // rather than with a bitwise shift.
  it("still works past the 32-bit counter boundary", () => {
    // The RFC publishes 65353130 for this time at eight digits; six digits is
    // its last six.
    expect(totpCodeAt(RFC_SECRET, 20000000000 * 1000)).toBe("353130");
  });
});

describe("Verifying a code", () => {
  const now = 1111111111 * 1000;

  it("accepts the current code", () => {
    expect(verifyTotp(RFC_SECRET, totpCodeAt(RFC_SECRET, now), now)).toBe(true);
  });

  // Phone clocks drift and people type slowly. A zero-tolerance window says
  // "wrong code" for a code that was right when it was read.
  it("accepts one step either side", () => {
    const period = TOTP_PERIOD_SECONDS * 1000;
    expect(verifyTotp(RFC_SECRET, totpCodeAt(RFC_SECRET, now - period), now)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpCodeAt(RFC_SECRET, now + period), now)).toBe(true);
  });

  it("refuses a code two steps away", () => {
    const period = TOTP_PERIOD_SECONDS * 1000;
    expect(verifyTotp(RFC_SECRET, totpCodeAt(RFC_SECRET, now - 2 * period), now)).toBe(false);
  });

  it("tolerates spaces a person types", () => {
    const code = totpCodeAt(RFC_SECRET, now);
    expect(verifyTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, now)).toBe(true);
  });

  it("refuses anything that is not six digits", () => {
    for (const code of ["", "12345", "1234567", "abcdef"]) {
      expect(verifyTotp(RFC_SECRET, code, now)).toBe(false);
    }
  });

  // An unreadable stored secret must fail closed, not throw into the login path.
  it("refuses rather than throwing on a malformed secret", () => {
    expect(verifyTotp("not-base32!!", "123456", now)).toBe(false);
  });
});

describe("Secrets and enrolment", () => {
  it("mints a 160-bit base32 secret", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(base32Decode(secret)).toHaveLength(20);
  });

  it("mints a different secret each time", () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret());
  });

  it("round trips base32, padded or lower case", () => {
    const encoded = base32Encode(Buffer.from("hello world"));
    expect(base32Decode(encoded).toString()).toBe("hello world");
    expect(base32Decode(encoded.toLowerCase()).toString()).toBe("hello world");
    expect(base32Decode(`${encoded}======`).toString()).toBe("hello world");
  });

  // Different apps read the issuer from the label or the parameter, and an
  // entry showing only an email address is indistinguishable from every other
  // account that person holds.
  it("names the issuer in both the label and the parameters", () => {
    const uri = totpEnrolmentUri({
      secret: RFC_SECRET,
      accountName: "admin@fleetpro.com",
      issuer: "TruckMoov",
    });

    expect(uri.startsWith("otpauth://totp/TruckMoov%3Aadmin%40fleetpro.com?")).toBe(true);
    expect(uri).toContain("issuer=TruckMoov");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});
