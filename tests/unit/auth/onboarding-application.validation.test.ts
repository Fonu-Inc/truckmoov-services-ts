import { describe, expect, it } from "vitest";
import {
  OnboardingValidationError,
  validateApplicantType,
  validateBusinessEmail,
  validateContactFullName,
  validateContactRole,
  validateLocation,
  validateNigerianPhone,
  validateOrganizationName,
  validateVerificationCode,
} from "@auth/onboarding/domain/onboarding-application.validation";
import { NigerianAddressError } from "@shared/nigeria";

describe("Nigerian phone validation", () => {
  it("normalises every accepted local and international shape to E.164", () => {
    const expected = "+2348000000000";
    for (const input of [
      "+234 80 0000 0000",
      "+2348000000000",
      "2348000000000",
      "08000000000",
      "080-0000-0000",
      "(080) 0000 0000",
      "8000000000",
    ]) {
      expect(validateNigerianPhone(input, "organizationPhone")).toBe(expected);
    }
  });

  it("rejects a number containing letters instead of stripping them", () => {
    expect(() => validateNigerianPhone("+234 80 0000 000O", "organizationPhone")).toThrow(
      /must not contain letters/,
    );
    expect(() => validateNigerianPhone("0800CALLNOW", "organizationPhone")).toThrow(
      /must not contain letters/,
    );
  });

  it("rejects wrong lengths, foreign numbers and invalid mobile prefixes", () => {
    for (const input of ["0800000000", "080000000000", "+14155550123", "06000000000", "+234 60 0000 0000"]) {
      expect(() => validateNigerianPhone(input, "organizationPhone")).toThrow(
        OnboardingValidationError,
      );
    }
  });

  it("rejects empty and symbol-only input", () => {
    for (const input of ["", "   ", "+", "++2348000000000"]) {
      expect(() => validateNigerianPhone(input, "organizationPhone")).toThrow(
        OnboardingValidationError,
      );
    }
  });

  it("reports the field it was given", () => {
    try {
      validateNigerianPhone("nope", "organizationPhone");
      expect.unreachable();
    } catch (error) {
      expect((error as OnboardingValidationError).field).toBe("organizationPhone");
    }
  });
});

describe("Applicant type", () => {
  it("accepts the two application types", () => {
    expect(validateApplicantType("enterprise")).toBe("enterprise");
    expect(validateApplicantType(" owner_operator ")).toBe("owner_operator");
  });

  it("rejects tenant organisation types that are not application types", () => {
    for (const input of ["fleet_provider", "aggregator", "", null]) {
      expect(() => validateApplicantType(input)).toThrow(OnboardingValidationError);
    }
  });
});

describe("Business email", () => {
  it("lowercases and trims a valid address", () => {
    expect(validateBusinessEmail("  Jane@Arne.COM ")).toBe("jane@arne.com");
  });

  it("rejects malformed addresses", () => {
    for (const input of [
      "jane@",
      "@arne.com",
      "jane@@arne.com",
      "jane@arne",
      "jane@arne..com",
      "jane doe@arne.com",
      "jane@.arne.com",
      ".jane@arne.com",
      "",
    ]) {
      expect(() => validateBusinessEmail(input)).toThrow(OnboardingValidationError);
    }
  });

  it("rejects an address over the 254 character limit", () => {
    expect(() => validateBusinessEmail(`${"a".repeat(250)}@arne.com`)).toThrow(
      OnboardingValidationError,
    );
  });
});

describe("Organization name", () => {
  it("collapses whitespace and keeps business punctuation", () => {
    expect(validateOrganizationName("  Arne   logistics Ltd ")).toBe("Arne logistics Ltd");
    expect(validateOrganizationName("A&B Haulage (Nig.) Ltd")).toBe("A&B Haulage (Nig.) Ltd");
  });

  it("rejects too short, too long and letterless names", () => {
    expect(() => validateOrganizationName("A")).toThrow(OnboardingValidationError);
    expect(() => validateOrganizationName("x".repeat(161))).toThrow(OnboardingValidationError);
    expect(() => validateOrganizationName("12345")).toThrow(OnboardingValidationError);
    expect(() => validateOrganizationName("Arne <script>")).toThrow(OnboardingValidationError);
  });
});

describe("Contact person", () => {
  it("accepts multi-word names with accents, hyphens and apostrophes", () => {
    expect(validateContactFullName("  Jane   Doe ")).toBe("Jane Doe");
    expect(validateContactFullName("Ngozi Adichie-Okonkwo")).toBe("Ngozi Adichie-Okonkwo");
    expect(validateContactFullName("Chinua O'Brien")).toBe("Chinua O'Brien");
  });

  it("rejects single names, digits and symbols", () => {
    for (const input of ["Jane", "Jane D0e", "Jane <b>Doe</b>", ""]) {
      expect(() => validateContactFullName(input)).toThrow(OnboardingValidationError);
    }
  });

  it("accepts a role containing letters and rejects one without", () => {
    expect(validateContactRole(" Fleet  Manager ")).toBe("Fleet Manager");
    expect(() => validateContactRole("12")).toThrow(OnboardingValidationError);
    expect(() => validateContactRole("F")).toThrow(OnboardingValidationError);
  });
});

describe("Address", () => {
  const place = (overrides: Partial<{ streetAddress: string; city: string; state: string }> = {}) => ({
    streetAddress: "12 Mazi Fedelis Street",
    city: "Ikeja",
    state: "Lagos",
    ...overrides,
  });
  const fieldOf = (run: () => unknown) => {
    try {
      run();
    } catch (error) {
      return error instanceof NigerianAddressError ? error.field : "not an address error";
    }
    return "no error";
  };

  it("accepts a street address with a house number and tidies the spacing", () => {
    expect(validateLocation(place({ streetAddress: " 12  Mazi Fedelis Street " })).streetAddress).toBe("12 Mazi Fedelis Street");
  });

  it("rejects a street address that is too short, too long or has no letters", () => {
    for (const streetAddress of ["12", "x".repeat(201), "1234"]) {
      expect(fieldOf(() => validateLocation(place({ streetAddress })))).toBe("streetAddress");
    }
  });

  it("canonicalises the state and accepts the common spellings", () => {
    expect(validateLocation(place({ state: "fct", city: "Kuje" })).state).toBe("FCT");
    expect(validateLocation(place({ state: "Lagos State" })).state).toBe("Lagos");
    expect(validateLocation(place({ state: "Abuja", city: "Kuje" })).state).toBe("FCT");
  });

  it("rejects a state that is not Nigerian", () => {
    for (const state of ["Texas", ""]) {
      expect(fieldOf(() => validateLocation(place({ state })))).toBe("state");
    }
  });

  it("requires the city to be a local government area of the state, in its canonical spelling", () => {
    expect(validateLocation(place({ city: "ikeja" })).city).toBe("Ikeja");
    expect(validateLocation(place({ state: "FCT", city: "abuja municipal area council" })).city).toBe("Abuja Municipal Area Council");
    for (const [state, city] of [["FCT", "Abuja"], ["Lagos", "Mumbai"], ["FCT", "Ikeja"]]) {
      expect(fieldOf(() => validateLocation(place({ state, city })))).toBe("city");
    }
  });

  it("keeps a stored legacy address sent back unchanged, but validates anything changed", () => {
    const stored = { streetAddress: "1234", city: "Lekki", state: "Lagos" };

    expect(validateLocation(stored, stored)).toEqual(stored);
    expect(fieldOf(() => validateLocation({ ...stored, state: "Ogun" }, stored))).toBe("city");
    expect(fieldOf(() => validateLocation({ ...stored, city: "Victoria Island" }, stored))).toBe("city");
    expect(fieldOf(() => validateLocation({ ...stored, streetAddress: "5678" }, stored))).toBe("streetAddress");
  });
});

describe("Verification code", () => {
  it("accepts exactly six digits", () => {
    expect(validateVerificationCode(" 123456 ")).toBe("123456");
  });

  it("rejects anything that is not six digits", () => {
    for (const input of ["12345", "1234567", "12345a", "  ", "١٢٣٤٥٦"]) {
      expect(() => validateVerificationCode(input)).toThrow(OnboardingValidationError);
    }
  });
});
