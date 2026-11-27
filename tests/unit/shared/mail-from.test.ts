import { describe, expect, it } from "vitest";
import { formatMailFrom } from "@shared/mailer";

describe("formatMailFrom", () => {
  it("gives a bare address a display name", () => {
    expect(formatMailFrom("hello@fonu.com", "FleetPro")).toBe('"FleetPro" <hello@fonu.com>');
  });

  it("keeps an address that already has a display name", () => {
    expect(formatMailFrom("FleetPro Team <hello@fonu.com>", "FleetPro")).toBe("FleetPro Team <hello@fonu.com>");
  });

  it("sends the bare address when no name is set", () => {
    expect(formatMailFrom("hello@fonu.com", "  ")).toBe("hello@fonu.com");
  });

  it("strips quotes and line breaks from the name", () => {
    expect(formatMailFrom("hello@fonu.com", 'Fleet"Pro\r\nBcc: x')).toBe('"FleetProBcc: x" <hello@fonu.com>');
  });
});
