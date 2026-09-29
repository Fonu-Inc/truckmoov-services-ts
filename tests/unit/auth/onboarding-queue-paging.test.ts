import { describe, expect, it } from "vitest";
import { positiveInt } from "../../../apps/auth/src/contexts/onboarding/application/use-cases/support/queue-paging";

describe("onboarding queue paging", () => {
  it("leaves an absent value for the repository default", () => {
    expect(positiveInt(undefined)).toBeUndefined();
  });

  it("keeps a valid whole number", () => {
    expect(positiveInt(1)).toBe(1);
    expect(positiveInt(7)).toBe(7);
  });

  // A page of 0 or below would become a negative offset and a 500.
  it("brings zero and negative values back to 1", () => {
    expect(positiveInt(0)).toBe(1);
    expect(positiveInt(-3)).toBe(1);
  });

  it("rounds a fraction down", () => {
    expect(positiveInt(2.9)).toBe(2);
    expect(positiveInt(0.5)).toBe(1);
  });
});
