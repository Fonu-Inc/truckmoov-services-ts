import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QoreIdKybAdapter } from "@auth/onboarding/infrastructure/kyb/qoreid-kyb.adapter";
import { validateIdentificationType } from "@auth/onboarding/domain/onboarding-application.validation";
import { ONBOARDING_IDENTIFICATION_TYPES } from "@auth/onboarding/domain/onboarding-application.repository";

const configured = { kyb: { qoreid: { baseUrl: "https://qoreid.test", clientId: "id", secret: "s" } } };

type Call = { url: string; body: Record<string, string> };

function stubVendor(answers: Record<string, unknown | null>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      if (url.endsWith("/token")) {
        return { ok: true, json: async () => ({ accessToken: "tok", expiresIn: 3600 }) };
      }
      calls.push({ url, body: JSON.parse(init.body) });
      const key = Object.keys(answers).find((path) => url.includes(path));
      const answer = key ? answers[key] : null;
      return answer === null
        ? { ok: false, json: async () => ({}) }
        : { ok: true, json: async () => answer };
    }),
  );
  return calls;
}

function adapter(config: object = configured) {
  return Reflect.construct(QoreIdKybAdapter, [config]) as QoreIdKybAdapter;
}

const query = (identificationType: string) => ({
  identificationType,
  identificationNumber: "A10000001",
  contactFullName: "Ada Obi",
});

describe("QoreID identity check", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("asks the driver-license endpoint for a driver's licence", async () => {
    const calls = stubVendor({
      "identities/driver-license/": { drivers_license: { firstname: "Ada", lastname: "Obi" } },
    });

    const result = await adapter().verifyIdentity(query("drivers_licence"));

    expect(calls[0].url).toBe("https://qoreid.test/v1/ng/identities/driver-license/A10000001");
    expect(calls[0].body).toEqual({ firstname: "Ada", lastname: "Obi" });
    expect(result).toMatchObject({ check: "identity", verdict: "match", provider: "qoreid" });
  });

  it("asks the passport endpoint for a passport", async () => {
    const calls = stubVendor({
      "identities/passport/": { passport: { firstname: "Ada", lastname: "Obi", middlename: "Grace" } },
    });

    const result = await adapter().verifyIdentity(query("passport"));

    expect(calls[0].url).toBe("https://qoreid.test/v1/ng/identities/passport/A10000001");
    expect(result.verdict).toBe("match");
  });

  it("still answers NIN", async () => {
    const calls = stubVendor({ "identities/nin/": { nin: { firstname: "Ada", lastname: "Obi" } } });

    const result = await adapter().verifyIdentity(query("nin"));

    expect(calls[0].url).toContain("identities/nin/A10000001");
    expect(result.verdict).toBe("match");
  });

  it("contradicts a different name on the record", async () => {
    stubVendor({ "identities/passport/": { passport: { firstname: "Chinedu", lastname: "Eze" } } });

    const result = await adapter().verifyIdentity(query("passport"));

    expect(result.verdict).toBe("mismatch");
    expect(result.fields[0].matched).toBe(false);
  });

  it("reports not_found when the registry holds no record", async () => {
    stubVendor({ "identities/driver-license/": { drivers_license: {} } });

    const result = await adapter().verifyIdentity(query("drivers_licence"));

    expect(result.verdict).toBe("not_found");
  });

  // An outage must read as "could not check", never as a pass or a refusal.
  it("is unavailable when the vendor does not answer", async () => {
    stubVendor({ "identities/passport/": null });

    const result = await adapter().verifyIdentity(query("passport"));

    expect(result.verdict).toBe("unavailable");
  });

  it("is unavailable, without a call, for a type it does not handle", async () => {
    const calls = stubVendor({});

    const result = await adapter().verifyIdentity(query("voters_card"));

    expect(result.verdict).toBe("unavailable");
    expect(calls).toHaveLength(0);
  });

  it("is unavailable when no credentials are configured", async () => {
    const calls = stubVendor({});

    const result = await adapter({ kyb: { qoreid: { baseUrl: "https://qoreid.test", clientId: "", secret: "" } } }).verifyIdentity(
      query("nin"),
    );

    expect(result.verdict).toBe("unavailable");
    expect(calls).toHaveLength(0);
  });
});

describe("accepted identification types", () => {
  it("are NIN, driver's licence and passport", () => {
    expect([...ONBOARDING_IDENTIFICATION_TYPES]).toEqual(["nin", "drivers_licence", "passport"]);
    for (const type of ONBOARDING_IDENTIFICATION_TYPES) {
      expect(validateIdentificationType(type)).toBe(type);
    }
  });

  it("no longer accepts a voter's card", () => {
    expect(() => validateIdentificationType("voters_card")).toThrow();
  });
});
