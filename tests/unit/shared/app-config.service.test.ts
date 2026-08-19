import { describe, expect, it } from "vitest";
import type { ConfigService } from "@nestjs/config";
import { AppConfigService } from "@shared/config";

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string, def?: unknown) => (key in values ? values[key] : def),
  } as unknown as ConfigService;
}

describe("AppConfigService.validateSecrets", () => {
  it("throws in production when JWT_SECRET is a placeholder", () => {
    expect(
      () =>
        new AppConfigService(
          makeConfig({
            NODE_ENV: "production",
            JWT_SECRET: "replace-me",
            POSTGRES_PASSWORD: "a-strong-db-password",
          }),
        ),
    ).toThrow(/JWT_SECRET/);
  });

  it("throws in production when POSTGRES_PASSWORD is the default placeholder", () => {
    expect(
      () =>
        new AppConfigService(
          makeConfig({
            NODE_ENV: "production",
            JWT_SECRET: "a-real-strong-secret-value",
            POSTGRES_PASSWORD: "truckmoov",
          }),
        ),
    ).toThrow(/POSTGRES_PASSWORD/);
  });

  it("throws in production when a required secret is unset", () => {
    expect(
      () =>
        new AppConfigService(
          makeConfig({
            NODE_ENV: "production",
            JWT_SECRET: "a-real-strong-secret-value",
          }),
        ),
    ).toThrow(/POSTGRES_PASSWORD/);
  });

  it("passes in production with real secrets", () => {
    expect(
      () =>
        new AppConfigService(
          makeConfig({
            NODE_ENV: "production",
            JWT_SECRET: "a-real-strong-secret-value",
            POSTGRES_PASSWORD: "a-strong-db-password",
          }),
        ),
    ).not.toThrow();
  });

  it("allows placeholders outside production (warns only)", () => {
    expect(
      () =>
        new AppConfigService(
          makeConfig({
            NODE_ENV: "development",
            JWT_SECRET: "replace-me",
            POSTGRES_PASSWORD: "truckmoov",
          }),
        ),
    ).not.toThrow();
  });
});
