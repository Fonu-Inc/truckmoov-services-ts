import { describe, expect, it, beforeEach } from "vitest";
import { Role } from "@shared/rbac";
import { AuthUser } from "../../../apps/auth/src/contexts/auth/session/domain/entities/auth-user.entity";
import { InviteUserUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/invite-user.use-case";
import { ValidateInviteUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/validate-invite.use-case";
import { RegisterInvitedUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/register-invited.use-case";
import { RegisterUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/register.use-case";
import { ForgotPasswordUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/forgot-password.use-case";
import { VerifyResetUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/verify-reset.use-case";
import { ResetPasswordUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/reset-password.use-case";
import { ChangeRoleUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/change-role.use-case";
import { LogoutUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/logout.use-case";
import { ForbiddenError } from "../../../apps/auth/src/contexts/auth/session/domain/errors/forbidden.error";
import { InviteNotFoundError } from "../../../apps/auth/src/contexts/auth/session/domain/errors/invite-not-found.error";
import { UsernameTakenError } from "../../../apps/auth/src/contexts/auth/session/domain/errors/username-taken.error";
import { UserNotFoundError } from "../../../apps/auth/src/contexts/auth/session/domain/errors/user-not-found.error";
import { InvalidResetTokenError } from "../../../apps/auth/src/contexts/auth/session/domain/errors/invalid-reset-token.error";
import {
  type DispatcherPreferences,
  type NotificationPreferences,
  type StoredUser,
  type UserProfile,
  normalizeStoredUser,
} from "../../../apps/auth/src/contexts/auth/session/domain/ports/user-repository.port";
import type { StoredInvite } from "../../../apps/auth/src/contexts/auth/session/domain/ports/invite-repository.port";
import type { OrganizationSettings } from "../../../apps/auth/src/contexts/auth/session/domain/ports/organization-settings.repository.port";
import type { StoredPasswordReset } from "../../../apps/auth/src/contexts/auth/session/domain/ports/password-reset-store.port";

// ── Fakes ───────────────────────────────────────────────

class FakeTokenService {
  private readonly tokens = new Map<string, AuthUser>();
  private counter = 0;

  issueAccessToken(user: AuthUser): string {
    const token = `access-${++this.counter}`;
    this.tokens.set(token, user);
    return token;
  }

  issueRefreshToken(): string {
    return `refresh-${++this.counter}`;
  }

  resolveAccessToken(token: string): AuthUser | null {
    return this.tokens.get(token) ?? null;
  }

  revokeAccessToken(token: string): void {
    this.tokens.delete(token);
  }
}

class FakeSessionStore {
  private readonly data = new Map<string, AuthUser>();

  async save(refreshToken: string, user: AuthUser) {
    this.data.set(refreshToken, user);
  }

  async getByRefreshToken(refreshToken: string) {
    return this.data.get(refreshToken) ?? null;
  }

  async deleteByRefreshToken(refreshToken: string) {
    this.data.delete(refreshToken);
  }

  async deleteAllForUser(userId: string) {
    for (const [k, v] of this.data.entries()) {
      if (v.id === userId) this.data.delete(k);
    }
  }

  get size() {
    return this.data.size;
  }
}

class FakeUserRepository {
  private readonly byUsername = new Map<string, StoredUser>();
  private readonly byId = new Map<string, StoredUser>();

  async findByUsername(username: string) {
    const user = this.byUsername.get(username);
    return user ? normalizeStoredUser(user) : null;
  }

  async findById(id: string) {
    const user = this.byId.get(id);
    return user ? normalizeStoredUser(user) : null;
  }

  async save(user: StoredUser) {
    const normalized = normalizeStoredUser(user);
    this.byUsername.set(normalized.username, normalized);
    this.byId.set(normalized.id, normalized);
  }

  async updateRoles(userId: string, roles: string[]) {
    const user = this.byId.get(userId);
    if (user) {
      const updated = { ...user, roles };
      this.byId.set(userId, updated);
      this.byUsername.set(user.username, updated);
    }
  }

  async updatePassword(userId: string, passwordHash: string) {
    const user = this.byId.get(userId);
    if (user) {
      const updated = { ...user, passwordHash };
      this.byId.set(userId, updated);
      this.byUsername.set(user.username, updated);
    }
  }

  async updateProfile(userId: string, profile: UserProfile) {
    const user = this.byId.get(userId);
    if (user) {
      const updated = { ...user, profile };
      this.byId.set(userId, updated);
      this.byUsername.set(user.username, updated);
    }
  }

  async updateNotificationPreferences(
    userId: string,
    preferences: NotificationPreferences,
  ) {
    const user = this.byId.get(userId);
    if (user) {
      const updated = { ...user, notificationPreferences: preferences };
      this.byId.set(userId, updated);
      this.byUsername.set(user.username, updated);
    }
  }

  async updateDispatcherPreferences(
    userId: string,
    preferences: DispatcherPreferences,
  ) {
    const user = this.byId.get(userId);
    if (user) {
      const updated = { ...user, dispatcherPreferences: preferences };
      this.byId.set(userId, updated);
      this.byUsername.set(user.username, updated);
    }
  }

  getById(id: string) {
    return this.byId.get(id);
  }
}

class FakeInviteRepository {
  private readonly store = new Map<string, StoredInvite>();

  async save(invite: StoredInvite) {
    this.store.set(invite.token, invite);
  }

  async findByToken(token: string) {
    return this.store.get(token) ?? null;
  }

  async findByEmail(email: string) {
    for (const inv of this.store.values()) {
      if (inv.email === email && inv.status === "pending") return inv;
    }
    return null;
  }

  async markAccepted(token: string) {
    const inv = this.store.get(token);
    if (inv) this.store.set(token, { ...inv, status: "accepted" });
  }

  getByToken(token: string) {
    return this.store.get(token);
  }
}

class FakeOrganizationSettingsRepository {
  private readonly store = new Map<string, OrganizationSettings>();

  async findByTenantId(tenantId: string) {
    return this.store.get(tenantId) ?? null;
  }

  async save(settings: OrganizationSettings) {
    this.store.set(settings.tenantId, settings);
  }

  getByTenantId(tenantId: string) {
    return this.store.get(tenantId) ?? null;
  }
}

class FakePasswordResetStore {
  private readonly store = new Map<string, StoredPasswordReset>();

  async save(reset: StoredPasswordReset) {
    this.store.set(reset.token, reset);
  }

  async findByToken(token: string) {
    const r = this.store.get(token);
    return r && !r.used ? r : null;
  }

  async findByUserIdAndCode(userId: string, code: string) {
    for (const r of this.store.values()) {
      if (r.userId === userId && r.code === code && !r.used) return r;
    }
    return null;
  }

  async markUsed(token: string) {
    const r = this.store.get(token);
    if (r) this.store.set(token, { ...r, used: true });
  }

  get size() {
    return this.store.size;
  }

  getFirst(): StoredPasswordReset | undefined {
    return this.store.values().next().value;
  }
}

class FakeMailerService {
  public sent: Array<{ to: string; subject: string }> = [];
  async send(opts: { to: string; subject: string }) {
    this.sent.push({ to: opts.to, subject: opts.subject });
  }
}

class FakeSmsService {
  public sent: Array<{ to: string }> = [];
  async send(opts: { to: string }) {
    this.sent.push({ to: opts.to });
  }
}

class FakeConfig {
  app = { frontendUrl: "http://localhost:3000" };
}

// ── Helpers ─────────────────────────────────────────────

function makeAdmin(tokenService: FakeTokenService, tenantId = "tenant-1"): string {
  const user = AuthUser.create({
    id: "admin-1",
    username: "admin@test.com",
    roles: [Role.ENTERPRISE_ADMIN],
    tenantId,
  });
  return tokenService.issueAccessToken(user);
}

function makeNonAdmin(tokenService: FakeTokenService, tenantId = "tenant-1"): string {
  const user = AuthUser.create({
    id: "viewer-1",
    username: "viewer@test.com",
    roles: [Role.FINANCE_VIEWER],
    tenantId,
  });
  return tokenService.issueAccessToken(user);
}

// ── Tests ───────────────────────────────────────────────

describe("RegisterUseCase", () => {
  it("creates a new enterprise admin with a fresh tenantId", async () => {
    const userRepo = new FakeUserRepository();
    const tokenService = new FakeTokenService();
    const sessionStore = new FakeSessionStore();
    const organizationRepo = new FakeOrganizationSettingsRepository();
    const uc = new RegisterUseCase(userRepo, tokenService, sessionStore, organizationRepo as any);

    const result = await uc.execute({
      username: "boss@co.com",
      password: "Str0ngPass!",
      firstName: "Boss",
      lastName: "Lady",
      organizationName: "Boss Transport",
    });

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.user.username).toBe("boss@co.com");
    expect(result.user.roles).toContain(Role.ENTERPRISE_ADMIN);
    expect(result.user.tenantId).toBeTruthy();
    expect(userRepo.getById(result.user.id)?.profile?.fullName).toBe("Boss Lady");
    expect(
      organizationRepo.getByTenantId(result.user.tenantId)?.branding.organizationName,
    ).toBe("Boss Transport");
  });

  it("rejects duplicate username", async () => {
    const userRepo = new FakeUserRepository();
    const tokenService = new FakeTokenService();
    const sessionStore = new FakeSessionStore();
    const organizationRepo = new FakeOrganizationSettingsRepository();
    const uc = new RegisterUseCase(userRepo, tokenService, sessionStore, organizationRepo as any);

    await uc.execute({
      username: "boss@co.com",
      password: "Str0ngPass!",
      firstName: "Boss",
      lastName: "Lady",
      organizationName: "Boss Transport",
    });
    await expect(uc.execute({
      username: "boss@co.com",
      password: "AnotherPass1",
      firstName: "Boss",
      lastName: "Lady",
      organizationName: "Boss Transport",
    }))
      .rejects.toBeInstanceOf(UsernameTakenError);
  });
});

describe("InviteUserUseCase", () => {
  let tokenService: FakeTokenService;
  let inviteRepo: FakeInviteRepository;
  let mailer: FakeMailerService;
  let uc: InviteUserUseCase;

  beforeEach(() => {
    tokenService = new FakeTokenService();
    inviteRepo = new FakeInviteRepository();
    mailer = new FakeMailerService();
    uc = new InviteUserUseCase(inviteRepo, tokenService, mailer as any, new FakeConfig() as any);
  });

  it("enterprise admin can invite a user", async () => {
    const accessToken = makeAdmin(tokenService);

    const result = await uc.execute({
      email: "new@user.com",
      role: Role.FLEET_ADMIN,
      accessToken,
    });

    expect(result.message).toBe("Invitation sent");
    expect(result.email).toBe("new@user.com");
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe("new@user.com");
  });

  it("rejects invite from non-admin role", async () => {
    const accessToken = makeNonAdmin(tokenService);

    await expect(
      uc.execute({ email: "x@y.com", role: Role.DISPATCHER, accessToken }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects invite with invalid token", async () => {
    await expect(
      uc.execute({ email: "x@y.com", role: Role.DISPATCHER, accessToken: "bogus" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects inviting an enterprise admin role", async () => {
    const accessToken = makeAdmin(tokenService);

    await expect(
      uc.execute({ email: "x@y.com", role: Role.ENTERPRISE_ADMIN, accessToken }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("ValidateInviteUseCase", () => {
  it("returns invite details for a valid token", async () => {
    const inviteRepo = new FakeInviteRepository();
    const uc = new ValidateInviteUseCase(inviteRepo);

    await inviteRepo.save({
      id: "inv-1", email: "user@co.com", role: Role.DISPATCHER,
      tenantId: "t-1", token: "valid-token", invitedBy: "admin-1",
      status: "pending", expiresAt: new Date(Date.now() + 86400000), createdAt: new Date(),
    });

    const result = await uc.execute("valid-token");
    expect(result.email).toBe("user@co.com");
    expect(result.role).toBe(Role.DISPATCHER);
    expect(result.tenantId).toBe("t-1");
  });

  it("rejects expired invite", async () => {
    const inviteRepo = new FakeInviteRepository();
    const uc = new ValidateInviteUseCase(inviteRepo);

    await inviteRepo.save({
      id: "inv-2", email: "old@co.com", role: Role.DISPATCHER,
      tenantId: "t-1", token: "expired-token", invitedBy: "admin-1",
      status: "pending", expiresAt: new Date(Date.now() - 1000), createdAt: new Date(),
    });

    await expect(uc.execute("expired-token")).rejects.toBeInstanceOf(InviteNotFoundError);
  });

  it("rejects unknown token", async () => {
    const uc = new ValidateInviteUseCase(new FakeInviteRepository());
    await expect(uc.execute("nope")).rejects.toBeInstanceOf(InviteNotFoundError);
  });
});

describe("RegisterInvitedUseCase", () => {
  let tokenService: FakeTokenService;
  let sessionStore: FakeSessionStore;
  let userRepo: FakeUserRepository;
  let inviteRepo: FakeInviteRepository;
  let uc: RegisterInvitedUseCase;

  beforeEach(async () => {
    tokenService = new FakeTokenService();
    sessionStore = new FakeSessionStore();
    userRepo = new FakeUserRepository();
    inviteRepo = new FakeInviteRepository();
    uc = new RegisterInvitedUseCase(userRepo, inviteRepo, tokenService, sessionStore);

    await inviteRepo.save({
      id: "inv-1", email: "invited@co.com", role: Role.FLEET_ADMIN,
      tenantId: "t-1", token: "good-token", invitedBy: "admin-1",
      status: "pending", expiresAt: new Date(Date.now() + 86400000), createdAt: new Date(),
    });
  });

  it("registers a user from a valid invite", async () => {
    const result = await uc.execute({
      inviteToken: "good-token",
      username: "invited@co.com",
      password: "Str0ngPass!",
    });

    expect(result.accessToken).toBeTruthy();
    expect(result.user.roles).toContain(Role.FLEET_ADMIN);
    expect(result.user.tenantId).toBe("t-1");

    const invite = inviteRepo.getByToken("good-token");
    expect(invite?.status).toBe("accepted");
  });

  it("rejects registration with expired invite", async () => {
    await inviteRepo.save({
      id: "inv-2", email: "late@co.com", role: Role.DISPATCHER,
      tenantId: "t-1", token: "expired-invite", invitedBy: "admin-1",
      status: "pending", expiresAt: new Date(Date.now() - 1000), createdAt: new Date(),
    });

    await expect(
      uc.execute({ inviteToken: "expired-invite", username: "late@co.com", password: "Pass1234!" }),
    ).rejects.toBeInstanceOf(InviteNotFoundError);
  });

  it("rejects registration if username is already taken", async () => {
    await userRepo.save({
      id: "existing", username: "invited@co.com", passwordHash: "x",
      roles: [Role.DISPATCHER], tenantId: "t-1",
    });

    await expect(
      uc.execute({ inviteToken: "good-token", username: "invited@co.com", password: "Pass1234!" }),
    ).rejects.toBeInstanceOf(UsernameTakenError);
  });

  it("rejects invite if role is ENTERPRISE_ADMIN", async () => {
    await inviteRepo.save({
      id: "inv-3", email: "sneaky@co.com", role: Role.ENTERPRISE_ADMIN,
      tenantId: "t-1", token: "admin-invite", invitedBy: "admin-1",
      status: "pending", expiresAt: new Date(Date.now() + 86400000), createdAt: new Date(),
    });

    await expect(
      uc.execute({ inviteToken: "admin-invite", username: "sneaky@co.com", password: "Pass1234!" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("ForgotPasswordUseCase", () => {
  let userRepo: FakeUserRepository;
  let resetStore: FakePasswordResetStore;
  let mailer: FakeMailerService;
  let uc: ForgotPasswordUseCase;

  beforeEach(async () => {
    userRepo = new FakeUserRepository();
    resetStore = new FakePasswordResetStore();
    mailer = new FakeMailerService();
    uc = new ForgotPasswordUseCase(
      userRepo, resetStore, mailer as any, new FakeConfig() as any,
    );

    await userRepo.save({
      id: "u-1", username: "user@test.com", passwordHash: "hash",
      roles: [Role.FLEET_ADMIN], tenantId: "t-1",
    });
  });

  it("sends reset email for known user", async () => {
    const result = await uc.execute({ identifier: "user@test.com" });

    expect(result.message).toContain("email");
    expect(mailer.sent).toHaveLength(1);
    expect(resetStore.size).toBe(1);
  });

  it("rejects unknown user", async () => {
    await expect(
      uc.execute({ identifier: "nobody@test.com" }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });
});

describe("VerifyResetUseCase", () => {
  let resetStore: FakePasswordResetStore;
  let uc: VerifyResetUseCase;

  beforeEach(() => {
    resetStore = new FakePasswordResetStore();
    uc = new VerifyResetUseCase(resetStore);
  });

  it("verifies valid reset token", async () => {
    await resetStore.save({
      id: "r-1", userId: "u-1", token: "email-token", method: "email",
      code: null, used: false, expiresAt: new Date(Date.now() + 3600000), createdAt: new Date(),
    });

    const result = await uc.execute({ token: "email-token" });
    expect(result.valid).toBe(true);
    expect(result.token).toBe("email-token");
  });

  it("rejects expired token", async () => {
    await resetStore.save({
      id: "r-3", userId: "u-1", token: "old-token", method: "email",
      code: null, used: false, expiresAt: new Date(Date.now() - 1000), createdAt: new Date(),
    });

    await expect(
      uc.execute({ token: "old-token" }),
    ).rejects.toBeInstanceOf(InvalidResetTokenError);
  });

  it("rejects invalid token", async () => {
    await expect(
      uc.execute({ token: "nonexistent-token" }),
    ).rejects.toBeInstanceOf(InvalidResetTokenError);
  });
});

describe("ResetPasswordUseCase", () => {
  it("resets password and invalidates all sessions", async () => {
    const userRepo = new FakeUserRepository();
    const resetStore = new FakePasswordResetStore();
    const sessionStore = new FakeSessionStore();
    const uc = new ResetPasswordUseCase(resetStore, userRepo, sessionStore);

    await userRepo.save({
      id: "u-1", username: "user@test.com", passwordHash: "old-hash",
      roles: [Role.FLEET_ADMIN], tenantId: "t-1",
    });

    const user = AuthUser.create({
      id: "u-1", username: "user@test.com", roles: [Role.FLEET_ADMIN], tenantId: "t-1",
    });
    await sessionStore.save("rt-1", user);
    await sessionStore.save("rt-2", user);
    expect(sessionStore.size).toBe(2);

    await resetStore.save({
      id: "r-1", userId: "u-1", token: "reset-tok", method: "email",
      code: null, used: false, expiresAt: new Date(Date.now() + 3600000), createdAt: new Date(),
    });

    const result = await uc.execute({ token: "reset-tok", newPassword: "NewStr0ng!" });

    expect(result.message).toContain("reset successfully");
    expect(sessionStore.size).toBe(0);

    const updated = userRepo.getById("u-1");
    expect(updated?.passwordHash).not.toBe("old-hash");
  });

  it("rejects expired reset token", async () => {
    const resetStore = new FakePasswordResetStore();
    const uc = new ResetPasswordUseCase(
      resetStore, new FakeUserRepository(), new FakeSessionStore(),
    );

    await resetStore.save({
      id: "r-2", userId: "u-1", token: "dead-tok", method: "email",
      code: null, used: false, expiresAt: new Date(Date.now() - 1000), createdAt: new Date(),
    });

    await expect(
      uc.execute({ token: "dead-tok", newPassword: "NewPass1!" }),
    ).rejects.toBeInstanceOf(InvalidResetTokenError);
  });
});

describe("ChangeRoleUseCase", () => {
  let tokenService: FakeTokenService;
  let userRepo: FakeUserRepository;
  let sessionStore: FakeSessionStore;
  let uc: ChangeRoleUseCase;

  beforeEach(async () => {
    tokenService = new FakeTokenService();
    userRepo = new FakeUserRepository();
    sessionStore = new FakeSessionStore();
    uc = new ChangeRoleUseCase(userRepo, tokenService, sessionStore);

    await userRepo.save({
      id: "target-1", username: "target@co.com", passwordHash: "hash",
      roles: [Role.DISPATCHER], tenantId: "tenant-1",
    });
  });

  it("enterprise admin can change a user role within the same tenant", async () => {
    const accessToken = makeAdmin(tokenService, "tenant-1");

    const result = await uc.execute({
      targetUserId: "target-1",
      newRole: Role.OPERATIONS_MANAGER,
      accessToken,
    });

    expect(result.newRole).toBe(Role.OPERATIONS_MANAGER);
    const updated = userRepo.getById("target-1");
    expect(updated?.roles).toContain(Role.OPERATIONS_MANAGER);
  });

  it("invalidates target user sessions after role change", async () => {
    const accessToken = makeAdmin(tokenService, "tenant-1");
    const target = AuthUser.create({
      id: "target-1", username: "target@co.com",
      roles: [Role.DISPATCHER], tenantId: "tenant-1",
    });
    await sessionStore.save("target-rt", target);
    expect(sessionStore.size).toBe(1);

    await uc.execute({
      targetUserId: "target-1",
      newRole: Role.FLEET_ADMIN,
      accessToken,
    });

    expect(sessionStore.size).toBe(0);
  });

  it("rejects role change from non-admin", async () => {
    const accessToken = makeNonAdmin(tokenService, "tenant-1");

    await expect(
      uc.execute({ targetUserId: "target-1", newRole: Role.FLEET_ADMIN, accessToken }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects role change for user in different tenant", async () => {
    const accessToken = makeAdmin(tokenService, "other-tenant");

    await expect(
      uc.execute({ targetUserId: "target-1", newRole: Role.FLEET_ADMIN, accessToken }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects role change for nonexistent user", async () => {
    const accessToken = makeAdmin(tokenService, "tenant-1");

    await expect(
      uc.execute({ targetUserId: "ghost", newRole: Role.FLEET_ADMIN, accessToken }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });
});

describe("LogoutUseCase", () => {
  it("deletes the refresh session", async () => {
    const sessionStore = new FakeSessionStore();
    const tokenService = new FakeTokenService();
    const uc = new LogoutUseCase(sessionStore, tokenService);

    const user = AuthUser.create({
      id: "u-1", username: "user@co.com",
      roles: [Role.FLEET_ADMIN], tenantId: "t-1",
    });
    await sessionStore.save("rt-1", user);
    expect(sessionStore.size).toBe(1);

    const result = await uc.execute({ refreshToken: "rt-1" });

    expect(result.message).toContain("Logged out");
    expect(result.userId).toBe("u-1");
    expect(sessionStore.size).toBe(0);
  });

  it("revokes the access token when provided", async () => {
    const sessionStore = new FakeSessionStore();
    const tokenService = new FakeTokenService();
    const uc = new LogoutUseCase(sessionStore, tokenService);

    const user = AuthUser.create({
      id: "u-1", username: "user@co.com",
      roles: [Role.FLEET_ADMIN], tenantId: "t-1",
    });
    const at = tokenService.issueAccessToken(user);
    await sessionStore.save("rt-1", user);

    await uc.execute({ refreshToken: "rt-1", accessToken: at });

    expect(tokenService.resolveAccessToken(at)).toBeNull();
  });

  it("handles logout for unknown refresh token gracefully", async () => {
    const sessionStore = new FakeSessionStore();
    const tokenService = new FakeTokenService();
    const uc = new LogoutUseCase(sessionStore, tokenService);

    const result = await uc.execute({ refreshToken: "nonexistent" });

    expect(result.message).toContain("Logged out");
    expect(result.userId).toBeNull();
  });
});
