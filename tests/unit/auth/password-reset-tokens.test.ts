import { describe, expect, it, vi } from "vitest";
import { ResetPasswordUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/reset-password.use-case";
import { InvalidResetTokenError } from "../../../apps/auth/src/contexts/auth/session/domain/errors/invalid-reset-token.error";
import { InMemoryPasswordResetStore } from "../../../apps/auth/src/contexts/auth/session/infrastructure/in-memory-password-reset.store";
import { MikroPasswordResetStore } from "../../../apps/auth/src/contexts/auth/session/infrastructure/mikro-password-reset.store";

const em = { upsert: vi.fn(async () => {}), findOne: vi.fn(async () => null) };
vi.mock("../../../apps/auth/src/contexts/auth/session/infrastructure/persistence/auth-orm", async (original) => ({
  ...(await original<object>()),
  getAuthOrm: async () => ({ em: { fork: () => em } }),
}));

const reset = (token: string) => ({
  id: token, userId: "u-1", token, method: "email" as const, code: null, used: false,
  expiresAt: new Date(Date.now() + 3_600_000), createdAt: new Date(),
});

describe("password reset tokens", () => {
  it("are stored and looked up hashed", async () => {
    const store = new MikroPasswordResetStore({ db: {} } as never);
    await store.save(reset("plain"));
    await store.findByToken("plain");

    const stored = (em.upsert.mock.calls[0] as unknown[])[1] as { token: string };
    expect(stored.token).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(em.findOne).toHaveBeenCalledWith(expect.anything(), { token: stored.token, used: false });
  });

  it("all stop working once one of them reset the password", async () => {
    const store = new InMemoryPasswordResetStore();
    await store.save(reset("first"));
    await store.save(reset("second"));
    const uc = new ResetPasswordUseCase(
      store,
      { findById: async () => null, updatePassword: async () => {} } as never,
      { deleteAllForUser: async () => {} } as never,
      { hash: async () => "h" } as never,
    );

    await uc.execute({ token: "second", newPassword: "N3wPassword!" });

    await expect(uc.execute({ token: "first", newPassword: "N3wPassword!" })).rejects.toBeInstanceOf(InvalidResetTokenError);
  });
});
