import { describe, expect, it } from "vitest";
import {
  companyNameMatches,
  normalizeCompanyName,
} from "@auth/onboarding/domain/company-name-match";

describe("companyNameMatches", () => {
  it.each([
    ["Acme Logistics Ltd", "ACME LOGISTICS LIMITED"],
    ["Acme Logistics", "Acme Logistics Nig. Ltd"],
    ["  acme   logistics, plc ", "Acme Logistics"],
    ["Acme Logistcs", "Acme Logistics"],
  ])("accepts %j for %j", (typed, company) => {
    expect(companyNameMatches(typed, company)).toBe(true);
  });

  it.each([
    ["vicotr are", "Victor Akaaha Logistics"],
    ["Beta Haulage", "Acme Logistics"],
    ["", "Acme Logistics"],
    ["Ltd", "Acme Logistics Ltd"],
  ])("refuses %j for %j", (typed, company) => {
    expect(companyNameMatches(typed, company)).toBe(false);
  });

  it("drops only trailing legal suffixes and keeps one word", () => {
    expect(normalizeCompanyName("Nigeria Breweries Plc")).toBe("nigeria breweries");
    expect(normalizeCompanyName("Services Ltd")).toBe("services");
  });
});
