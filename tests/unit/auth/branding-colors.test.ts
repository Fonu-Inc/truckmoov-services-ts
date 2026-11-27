import { describe, expect, it } from "vitest";
import { InvalidSettingsError } from "@auth/session/domain/errors/invalid-settings.error";
import { assertValidBrandingColors } from "@auth/session/application/use-cases/support/settings-validation";

describe("assertValidBrandingColors", () => {
  it("accepts themed hex colours and unset fields", () => {
    expect(() => assertValidBrandingColors({ primaryColor: { dark: "#0D9488", light: "#14B8A6" }, accentColor: null, sidebarText: undefined })).not.toThrow();
  });

  it("refuses a packed string, a non-hex value and a half-set theme", () => {
    expect(() => assertValidBrandingColors({ primaryColor: "#FFC106:#FFC107" })).toThrow(InvalidSettingsError);
    expect(() => assertValidBrandingColors({ accentColor: { dark: "red", light: "#FFFFFF" } })).toThrow(InvalidSettingsError);
    expect(() => assertValidBrandingColors({ sidebarText: { dark: "#000000" } })).toThrow(InvalidSettingsError);
  });
});
