import { describe, expect, it } from "vitest";
import {
  NIGERIAN_STATES,
  NigerianAddressError,
  canonicalLga,
  isInsideNigeria,
  lgasOf,
  normalizeCountry,
  mentionsForeignPlace,
  mentionsNigerianPlace,
  normalizeNigerianState,
  optionalAddressLine,
  optionalAddressLine2,
  requireAddressLine,
  requireCity,
  requireCoordinates,
  requireState,
} from "@shared/nigeria";

describe("the state list", () => {
  it("holds the 36 states and FCT", () => {
    expect(NIGERIAN_STATES).toHaveLength(37);
  });

  it("holds all 774 local government areas, none of them empty", () => {
    const counts = NIGERIAN_STATES.map((state) => lgasOf(state).length);
    expect(counts.every((count) => count > 0)).toBe(true);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(774);
  });
});

describe("normalizeNigerianState", () => {
  it.each([
    ["Lagos", "Lagos"],
    ["lagos", "Lagos"],
    ["Lagos State", "Lagos"],
    ["  AKWA   ibom ", "Akwa Ibom"],
    ["Cross-River", "Cross River"],
    ["Abuja (FCT)", "FCT"],
    ["Federal Capital Territory", "FCT"],
    ["fct", "FCT"],
    ["Abuja", "FCT"],
    ["Katsina State", "Katsina"],
  ])("%s becomes %s", (raw, expected) => {
    expect(normalizeNigerianState(raw)).toBe(expected);
  });

  it.each(["", "Texas", "Accra", "Kastina", "State", null, undefined, 5])("refuses %s", (raw) => {
    expect(normalizeNigerianState(raw)).toBeNull();
  });
});

describe("canonicalLga", () => {
  it("matches ignoring case, spacing and punctuation", () => {
    expect(canonicalLga("Lagos", "IKEJA")).toBe("Ikeja");
    expect(canonicalLga("Lagos State", " ikeja ")).toBe("Ikeja");
    expect(canonicalLga("Akwa Ibom", "ibiono ibom")).toBe("Ibiono-Ibom");
    expect(canonicalLga("Katsina", "Katsina")).toBe("Katsina");
    expect(canonicalLga("FCT", "Abuja Municipal Area Council")).toBe("Abuja Municipal Area Council");
    expect(canonicalLga("Kebbi", "Mai'Adua")).toBeNull();
    expect(canonicalLga("Katsina", "Mai'Adua")).toBe("Mai'Adua");
  });

  it("refuses an area of another state, a non-area and a non-state", () => {
    expect(canonicalLga("Lagos", "Gwagwalada")).toBeNull();
    expect(canonicalLga("Lagos", "Yaba")).toBeNull();
    expect(canonicalLga("Texas", "Ikeja")).toBeNull();
    expect(canonicalLga("Lagos", "")).toBeNull();
  });
});

describe("isInsideNigeria", () => {
  it("accepts places in the country and the box edges", () => {
    expect(isInsideNigeria(6.5244, 3.3792)).toBe(true);
    expect(isInsideNigeria(9.0765, 7.3986)).toBe(true);
    expect(isInsideNigeria(4.2, 2.6)).toBe(true);
    expect(isInsideNigeria(13.9, 14.7)).toBe(true);
  });

  it("refuses places abroad and values that are not coordinates", () => {
    expect(isInsideNigeria(51.5, -0.12)).toBe(false);
    expect(isInsideNigeria(5.6, -0.19)).toBe(false);
    expect(isInsideNigeria(14, 8)).toBe(false);
    expect(isInsideNigeria(Number.NaN, 3)).toBe(false);
    expect(isInsideNigeria(6, Number.POSITIVE_INFINITY)).toBe(false);
    expect(isInsideNigeria("6.5", "3.3")).toBe(false);
    expect(isInsideNigeria(null, undefined)).toBe(false);
  });
});

describe("normalizeCountry", () => {
  it.each(["Nigeria", "nigeria", " NG ", "NGA"])("reads %s as Nigeria", (raw) => {
    expect(normalizeCountry(raw)).toBe("Nigeria");
  });

  it.each(["Ghana", "", "Niger", null, undefined])("refuses %s", (raw) => {
    expect(normalizeCountry(raw)).toBeNull();
  });
});

describe("address validators", () => {
  const field = (act: () => unknown) => {
    try {
      act();
    } catch (error) {
      expect(error).toBeInstanceOf(NigerianAddressError);
      return (error as NigerianAddressError).field;
    }
    throw new Error("expected an error");
  };

  it("requireState canonicalises or names the field", () => {
    expect(requireState("lagos state")).toBe("Lagos");
    expect(field(() => requireState("Texas", "serviceAreas"))).toBe("serviceAreas");
  });

  it("requireCity takes a free-text place name, and the LGA list only when asked", () => {
    expect(requireCity("  Some   Town ", "Lagos", false)).toBe("Some Town");
    expect(requireCity("Lekki Phase 1", "Lagos", false)).toBe("Lekki Phase 1");
    expect(requireCity("Ikeja, Lagos", "Lagos", false)).toBe("Ikeja, Lagos");
    expect(requireCity("St. Mary's (Annex)/East", null, false)).toBe("St. Mary's (Annex)/East");
    expect(requireCity(" ikeja ", "Lagos", true)).toBe("Ikeja");
    expect(field(() => requireCity("12", "Lagos", false))).toBe("city");
    expect(field(() => requireCity("<b>Lagos</b>", "Lagos", false))).toBe("city");
    expect(field(() => requireCity("Lagos\u0000", "Lagos", false))).toBe("city");
    expect(field(() => requireCity("L", "Lagos", false))).toBe("city");
    expect(field(() => requireCity("a".repeat(81), "Lagos", false))).toBe("city");
    expect(field(() => requireCity("Yaba", "Lagos", true))).toBe("city");
    expect(field(() => requireCity("Ikeja", null, true))).toBe("city");
  });

  it("requireCity accepts every local government area of every state, slashes included", () => {
    for (const state of NIGERIAN_STATES) {
      for (const lga of lgasOf(state)) expect(requireCity(lga, state, true)).toBe(lga);
    }
    expect(requireCity("obio/akpor", "Rivers", true)).toBe("Obio/Akpor");
  });

  it("optionalAddressLine2 allows short unit numbers and refuses control characters", () => {
    expect(optionalAddressLine2(undefined)).toBeNull();
    expect(optionalAddressLine2("  ")).toBeNull();
    expect(optionalAddressLine2(" 2B ")).toBe("2B");
    expect(optionalAddressLine2("12")).toBe("12");
    expect(field(() => optionalAddressLine2("a\u0007b"))).toBe("addressLine2");
    expect(field(() => optionalAddressLine2("a".repeat(201)))).toBe("addressLine2");
  });

  it("requireAddressLine wants 3 to 200 characters with a letter", () => {
    expect(requireAddressLine("  12   Allen Avenue ")).toBe("12 Allen Avenue");
    expect(field(() => requireAddressLine("12"))).toBe("addressLine");
    expect(field(() => requireAddressLine("1234"))).toBe("addressLine");
    expect(field(() => requireAddressLine("a".repeat(201), "addressLine1"))).toBe("addressLine1");
  });

  it("optionalAddressLine treats blank as absent", () => {
    expect(optionalAddressLine(undefined)).toBeNull();
    expect(optionalAddressLine("   ")).toBeNull();
    expect(optionalAddressLine(" 4 Marina ")).toBe("4 Marina");
    expect(field(() => optionalAddressLine("99999"))).toBe("address");
  });

  it("requireCoordinates takes both or neither, inside Nigeria", () => {
    expect(requireCoordinates(undefined, null)).toBeNull();
    expect(requireCoordinates(6.5, 3.4)).toEqual({ latitude: 6.5, longitude: 3.4 });
    expect(field(() => requireCoordinates(6.5, undefined))).toBe("addressLongitude");
    expect(field(() => requireCoordinates(undefined, 3.4))).toBe("addressLatitude");
    expect(field(() => requireCoordinates(51.5, -0.1))).toBe("addressLatitude");
    expect(field(() => requireCoordinates(Number.NaN, 3.4))).toBe("addressLatitude");
  });
});

describe("mentionsNigerianPlace", () => {
  it.each(["12 Marina Road, Lagos Island", "Plot 5, Wuse 2, Abuja", "3 Bode Thomas, Surulere, Lagos State", "Km 4 Port Harcourt Road, Rivers", "Nigeria"])(
    "accepts %s",
    (line) => expect(mentionsNigerianPlace(line)).toBe(true),
  );
  it.each(["12 Main Street, Houston, Texas", "10 Downing Street, London", "5 Nigerian Avenue", "Plot 5", ""])(
    "does not count %s as a Nigerian place",
    (line) => expect(mentionsNigerianPlace(line)).toBe(false),
  );
});

describe("mentionsForeignPlace", () => {
  it.each(["12 Main Street, Houston, Texas", "10 Downing Street, London", "1 Elm St, Austin, TX 78701", "4 Rue de Rivoli, Paris, France"])(
    "flags %s",
    (line) => expect(mentionsForeignPlace(line)).toBe(true),
  );
  it.each(["14 Admiralty Way, Lekki", "Plot 5, Wuse 2", "22 Warehouse Road, Apapa", "7 Benin Road, Warri", "5 Georgia Street, Ikeja", "Km 4 Ibadan Road, Oyo 200001"])(
    "lets %s through",
    (line) => expect(mentionsForeignPlace(line)).toBe(false),
  );
});
