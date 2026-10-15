import { describe, expect, it } from "vitest";
import { clientIp } from "@shared/access";

describe("clientIp", () => {
  it("ignores a caller-supplied X-Forwarded-For and uses the proxy-resolved req.ip", () => {
    expect(clientIp({ method: "GET", headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" }, ip: "10.0.0.9" })).toBe("10.0.0.9");
  });
});
