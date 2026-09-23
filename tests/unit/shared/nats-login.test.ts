import { describe, expect, it } from "vitest";
import { natsLogin } from "@shared/eventbus";

describe("the login a service presents to the event bus", () => {
  it("presents the service's own user", () => {
    expect(natsLogin({ user: "fleet", password: "secret" })).toEqual({ user: "fleet", pass: "secret" });
  });

  it("connects anonymously when no user is configured", () => {
    expect(natsLogin({ user: "", password: "secret" })).toEqual({});
    expect(natsLogin({})).toEqual({});
  });
});
