import { describe, expect, it } from "vitest";
import {
  OnboardingValidationError,
  validateApplicantType,
  validateBusinessEmail,
  validateCity,
  validateContactFullName,
  validateContactRole,
  validateNigerianPhone,
  validateOrganizationName,
  validateState,
  validateStreetAddress,
  validateVerificationCode,
} from "../../../apps/auth/src/onboarding-application.validation";

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
    expect(validateApplicantType("fleet_provider")).toBe("fleet_provider");
    expect(validateApplicantType(" owner_operator ")).toBe("owner_operator");
  });

  it("rejects tenant organisation types that are not application types", () => {
    for (const input of ["enterprise", "aggregator", "", null]) {
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
  it("accepts a street address with a house number", () => {
    expect(validateStreetAddress(" 12  Mazi Fedelis Street ")).toBe("12 Mazi Fedelis Street");
  });

  it("rejects a street address that is too short or too long", () => {
    expect(() => validateStreetAddress("12")).toThrow(OnboardingValidationError);
    expect(() => validateStreetAddress("x".repeat(201))).toThrow(OnboardingValidationError);
  });

  it("rejects a city containing digits", () => {
    expect(validateCity(" Abuja ")).toBe("Abuja");
    expect(() => validateCity("Abuja 2")).toThrow(OnboardingValidationError);
  });

  it("matches a state case-insensitively and returns the canonical spelling", () => {
    expect(validateState("fct")).toBe("FCT");
    expect(validateState(" lagos ")).toBe("Lagos");
    expect(validateState("cross river")).toBe("Cross River");
  });

  it("rejects a state that is not Nigerian", () => {
    for (const input of ["Texas", "Lagoss", ""]) {
      expect(() => validateState(input)).toThrow(OnboardingValidationError);
    }
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
