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
import { ListOrganizationUsersUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/list-organization-users.use-case";
import { LogoutUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/logout.use-case";
import { RemoveOrganizationUserUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/remove-organization-user.use-case";
import { ResendPendingInviteUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/resend-pending-invite.use-case";
import { UpdateOrganizationUserUseCase } from "../../../apps/auth/src/contexts/auth/session/application/use-cases/update-organization-user.use-case";
import { ForbiddenError } from "../../../apps/auth/src/contexts/auth/session/domain/errors/forbidden.error";
import { InviteNotFoundError } from "../../../apps/auth/src/contexts/auth/session/domain/errors/invite-not-found.error";
import { EmailTakenError } from "../../../apps/auth/src/contexts/auth/session/domain/errors/email-taken.error";
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

class FakeIdGenerator {
  private counter = 0;

  generate() {
    this.counter += 1;
    return `id-${this.counter}`;
  }
}

class FakePasswordHasher {
  async hash(password: string) {
    return `hashed:${password}`;
  }
}

class FakeAuthNotifier {
  public invites: Array<{ email: string; role: string; inviteToken: string }> = [];
  public resets: Array<{ email: string; resetToken: string }> = [];
  public verifications: Array<{ email: string; firstName: string; verificationToken: string }> = [];

  async sendInviteEmail(input: { email: string; role: string; inviteToken: string }) {
    this.invites.push(input);
  }

  async sendPasswordResetEmail(input: { email: string; resetToken: string }) {
    this.resets.push(input);
  }

  async sendVerificationEmail(input: { email: string; firstName: string; verificationToken: string }) {
    this.verifications.push(input);
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
  private readonly byEmail = new Map<string, StoredUser>();
  private readonly byId = new Map<string, StoredUser>();

  async findByEmail(email: string) {
    const user = this.byEmail.get(email);
    return user ? normalizeStoredUser(user) : null;
  }

  async findById(id: string) {
    const user = this.byId.get(id);
    return user ? normalizeStoredUser(user) : null;
  }

  async findAllByTenant(tenantId: string) {
    return [...this.byId.values()]
      .filter((user) => user.tenantId === tenantId)
      .map((user) => normalizeStoredUser(user))
      .sort((left, right) => left.email.localeCompare(right.email));
  }

  async save(user: StoredUser) {
    const normalized = normalizeStoredUser(user);
    this.byEmail.set(normalized.email, normalized);
    this.byId.set(normalized.id, normalized);
  }

  async updateRole(userId: string, role: string) {
    const user = this.byId.get(userId);
    if (user) {
      const updated = { ...user, role };
      this.byId.set(userId, updated);
      this.byEmail.set(user.email, updated);
    }
  }

  async updatePassword(userId: string, passwordHash: string) {
    const user = this.byId.get(userId);
    if (user) {
      const updated = { ...user, passwordHash };
      this.byId.set(userId, updated);
      this.byEmail.set(user.email, updated);
    }
  }

  async updateProfile(userId: string, profile: UserProfile) {
    const user = this.byId.get(userId);
    if (user) {
      const updated = { ...user, profile };
      this.byId.set(userId, updated);
      this.byEmail.set(user.email, updated);
    }
  }

  async deleteById(userId: string) {
    const user = this.byId.get(userId);
    if (!user) return;
    this.byId.delete(userId);
    this.byEmail.delete(user.email);
  }

  async updateNotificationPreferences(
    userId: string,
    preferences: NotificationPreferences,
  ) {
    const user = this.byId.get(userId);
    if (user) {
      const updated = { ...user, notificationPreferences: preferences };
      this.byId.set(userId, updated);
      this.byEmail.set(user.email, updated);
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
      this.byEmail.set(user.email, updated);
    }
  }

  getById(id: string) {
    return this.byId.get(id);
  }
}

class FakeInviteRepository {
  private readonly store = new Map<string, StoredInvite>();

  async save(invite: StoredInvite) {
    for (const [token, existing] of this.store.entries()) {
      if (existing.id === invite.id && token !== invite.token) {
        this.store.delete(token);
      }
    }
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

  async findPendingByEmailForTenant(tenantId: string, email: string) {
    const invites = [...this.store.values()]
      .filter((invite) =>
        invite.tenantId === tenantId
        && invite.email === email
        && invite.status === "pending",
      )
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    return invites[0] ?? null;
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

// ── Helpers ─────────────────────────────────────────────

function makeAdmin(tokenService: FakeTokenService, tenantId = "tenant-1"): string {
  const user = AuthUser.create({
    id: "admin-1",
    email: "admin@test.com",
    role: Role.ENTERPRISE_ADMIN,
    tenantId,
  });
  return tokenService.issueAccessToken(user);
}

function makeNonAdmin(tokenService: FakeTokenService, tenantId = "tenant-1"): string {
  const user = AuthUser.create({
    id: "viewer-1",
    email: "viewer@test.com",
    role: Role.FINANCE_VIEWER,
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
    const uc = new RegisterUseCase(
      userRepo,
      tokenService,
      sessionStore,
      organizationRepo as any,
      new FakePasswordHasher() as any,
      new FakeIdGenerator() as any,
      new FakeAuthNotifier() as any,
    );

    const result = await uc.execute({
      email: "boss@co.com",
      password: "Str0ngPass!",
      firstName: "Boss",
      lastName: "Lady",
      organizationName: "Boss Transport",
    });

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.user.email).toBe("boss@co.com");
    expect(result.user.role).toBe(Role.ENTERPRISE_ADMIN);
    expect(result.user.tenantId).toBeTruthy();
    expect(userRepo.getById(result.user.id)?.profile?.fullName).toBe("Boss Lady");
    expect(userRepo.getById(result.user.id)?.profile?.address).toBeNull();
    expect(userRepo.getById(result.user.id)?.profile?.profilePictureUrl).toBeNull();
    expect(
      organizationRepo.getByTenantId(result.user.tenantId)?.branding.organizationName,
    ).toBe("Boss Transport");
  });

  it("rejects duplicate email", async () => {
    const userRepo = new FakeUserRepository();
    const tokenService = new FakeTokenService();
    const sessionStore = new FakeSessionStore();
    const organizationRepo = new FakeOrganizationSettingsRepository();
    const uc = new RegisterUseCase(
      userRepo,
      tokenService,
      sessionStore,
      organizationRepo as any,
      new FakePasswordHasher() as any,
      new FakeIdGenerator() as any,
      new FakeAuthNotifier() as any,
    );

    await uc.execute({
      email: "boss@co.com",
      password: "Str0ngPass!",
      firstName: "Boss",
      lastName: "Lady",
      organizationName: "Boss Transport",
    });
    await expect(uc.execute({
      email: "boss@co.com",
      password: "AnotherPass1",
      firstName: "Boss",
      lastName: "Lady",
      organizationName: "Boss Transport",
    }))
      .rejects.toBeInstanceOf(EmailTakenError);
  });
});

describe("InviteUserUseCase", () => {
  let tokenService: FakeTokenService;
  let inviteRepo: FakeInviteRepository;
  let notifier: FakeAuthNotifier;
  let uc: InviteUserUseCase;

  beforeEach(() => {
    tokenService = new FakeTokenService();
    inviteRepo = new FakeInviteRepository();
    notifier = new FakeAuthNotifier();
    uc = new InviteUserUseCase(
      inviteRepo,
      tokenService,
      notifier as any,
      new FakeIdGenerator() as any,
    );
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
    expect(notifier.invites).toHaveLength(1);
    expect(notifier.invites[0].email).toBe("new@user.com");
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
    uc = new RegisterInvitedUseCase(
      userRepo,
      inviteRepo,
      tokenService,
      sessionStore,
      new FakePasswordHasher() as any,
      new FakeIdGenerator() as any,
    );

    await inviteRepo.save({
      id: "inv-1", email: "invited@co.com", role: Role.FLEET_ADMIN,
      tenantId: "t-1", token: "good-token", invitedBy: "admin-1",
      status: "pending", expiresAt: new Date(Date.now() + 86400000), createdAt: new Date(),
    });
  });

  it("registers a user from a valid invite", async () => {
    const result = await uc.execute({
      inviteToken: "good-token",
      email: "invited@co.com",
      password: "Str0ngPass!",
    });

    expect(result.accessToken).toBeTruthy();
    expect(result.user.role).toBe(Role.FLEET_ADMIN);
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
      uc.execute({ inviteToken: "expired-invite", email: "late@co.com", password: "Pass1234!" }),
    ).rejects.toBeInstanceOf(InviteNotFoundError);
  });

  it("rejects registration if email is already taken", async () => {
    await userRepo.save({
      id: "existing", email: "invited@co.com", passwordHash: "x",
      role: Role.DISPATCHER, tenantId: "t-1",
    });

    await expect(
      uc.execute({ inviteToken: "good-token", email: "invited@co.com", password: "Pass1234!" }),
    ).rejects.toBeInstanceOf(EmailTakenError);
  });

  it("rejects invite if role is ENTERPRISE_ADMIN", async () => {
    await inviteRepo.save({
      id: "inv-3", email: "sneaky@co.com", role: Role.ENTERPRISE_ADMIN,
      tenantId: "t-1", token: "admin-invite", invitedBy: "admin-1",
      status: "pending", expiresAt: new Date(Date.now() + 86400000), createdAt: new Date(),
    });

    await expect(
      uc.execute({ inviteToken: "admin-invite", email: "sneaky@co.com", password: "Pass1234!" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("ForgotPasswordUseCase", () => {
  let userRepo: FakeUserRepository;
  let resetStore: FakePasswordResetStore;
  let notifier: FakeAuthNotifier;
  let uc: ForgotPasswordUseCase;

  beforeEach(async () => {
    userRepo = new FakeUserRepository();
    resetStore = new FakePasswordResetStore();
    notifier = new FakeAuthNotifier();
    uc = new ForgotPasswordUseCase(
      userRepo,
      resetStore,
      notifier as any,
      new FakeIdGenerator() as any,
    );

    await userRepo.save({
      id: "u-1", email: "user@test.com", passwordHash: "hash",
      role: Role.FLEET_ADMIN, tenantId: "t-1",
    });
  });

  it("sends reset email for known user", async () => {
    const result = await uc.execute({ identifier: "user@test.com" });

    expect(result.message).toContain("email");
    expect(notifier.resets).toHaveLength(1);
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
    const uc = new ResetPasswordUseCase(
      resetStore,
      userRepo,
      sessionStore,
      new FakePasswordHasher() as any,
    );

    await userRepo.save({
      id: "u-1", email: "user@test.com", passwordHash: "old-hash",
      role: Role.FLEET_ADMIN, tenantId: "t-1",
    });

    const user = AuthUser.create({
      id: "u-1", email: "user@test.com", role: Role.FLEET_ADMIN, tenantId: "t-1",
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
      resetStore,
      new FakeUserRepository(),
      new FakeSessionStore(),
      new FakePasswordHasher() as any,
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
      id: "target-1", email: "target@co.com", passwordHash: "hash",
      role: Role.DISPATCHER, tenantId: "tenant-1",
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
    expect(updated?.role).toBe(Role.OPERATIONS_MANAGER);
  });

  it("invalidates target user sessions after role change", async () => {
    const accessToken = makeAdmin(tokenService, "tenant-1");
    const target = AuthUser.create({
      id: "target-1", email: "target@co.com",
      role: Role.DISPATCHER, tenantId: "tenant-1",
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

describe("Organization user management use cases", () => {
  it("lists users within the caller tenant", async () => {
    const tokenService = new FakeTokenService();
    const userRepo = new FakeUserRepository();
    const uc = new ListOrganizationUsersUseCase(tokenService, userRepo);

    await userRepo.save({
      id: "admin-1", email: "admin@co.com", passwordHash: "hash",
      role: Role.ENTERPRISE_ADMIN, tenantId: "tenant-1",
    });
    await userRepo.save({
      id: "user-1", email: "dispatcher@co.com", passwordHash: "hash",
      role: Role.DISPATCHER, tenantId: "tenant-1",
    });
    await userRepo.save({
      id: "user-2", email: "other@co.com", passwordHash: "hash",
      role: Role.DISPATCHER, tenantId: "tenant-2",
    });

    const accessToken = tokenService.issueAccessToken(
      AuthUser.create({
        id: "admin-1",
        email: "admin@co.com",
        role: Role.ENTERPRISE_ADMIN,
        tenantId: "tenant-1",
      }),
    );

    const result = await uc.execute(accessToken);

    expect(result.tenantId).toBe("tenant-1");
    expect(result.users).toHaveLength(2);
    expect(result.users.map((user) => user.email)).toEqual([
      "admin@co.com",
      "dispatcher@co.com",
    ]);
  });

  it("updates another user profile within the same tenant", async () => {
    const tokenService = new FakeTokenService();
    const userRepo = new FakeUserRepository();
    const uc = new UpdateOrganizationUserUseCase(tokenService, userRepo);

    await userRepo.save({
      id: "admin-1", email: "admin@co.com", passwordHash: "hash",
      role: Role.ENTERPRISE_ADMIN, tenantId: "tenant-1",
    });
    await userRepo.save({
      id: "user-1", email: "dispatcher@co.com", passwordHash: "hash",
      role: Role.DISPATCHER, tenantId: "tenant-1",
      profile: {
        fullName: "Old Name",
        phoneNumber: null,
        address: null,
        profilePictureUrl: null,
      },
    });

    const accessToken = tokenService.issueAccessToken(
      AuthUser.create({
        id: "admin-1",
        email: "admin@co.com",
        role: Role.ENTERPRISE_ADMIN,
        tenantId: "tenant-1",
      }),
    );

    const result = await uc.execute({
      accessToken,
      targetUserId: "user-1",
      fullName: "New Name",
      phoneNumber: "+2348012345678",
      address: "12 Marina, Lagos",
    });

    expect(result.user.profile.fullName).toBe("New Name");
    expect(result.user.profile.address).toBe("12 Marina, Lagos");
    expect(userRepo.getById("user-1")?.profile?.phoneNumber).toBe("+2348012345678");
  });

  it("resends a pending invite by rotating its token", async () => {
    const tokenService = new FakeTokenService();
    const inviteRepo = new FakeInviteRepository();
    const userRepo = new FakeUserRepository();
    const notifier = new FakeAuthNotifier();
    const uc = new ResendPendingInviteUseCase(
      inviteRepo,
      tokenService,
      notifier as any,
      new FakeIdGenerator() as any,
      userRepo,
    );

    await userRepo.save({
      id: "admin-1", email: "admin@co.com", passwordHash: "hash",
      role: Role.ENTERPRISE_ADMIN, tenantId: "tenant-1",
    });
    await inviteRepo.save({
      id: "inv-1",
      email: "pending@co.com",
      role: Role.DISPATCHER,
      tenantId: "tenant-1",
      token: "old-token",
      invitedBy: "admin-1",
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(Date.now() - 60_000),
    });

    const accessToken = tokenService.issueAccessToken(
      AuthUser.create({
        id: "admin-1",
        email: "admin@co.com",
        role: Role.ENTERPRISE_ADMIN,
        tenantId: "tenant-1",
      }),
    );

    const result = await uc.execute({
      accessToken,
      email: "pending@co.com",
    });

    expect(result.message).toBe("Invitation resent");
    expect(notifier.invites.at(-1)?.email).toBe("pending@co.com");
    expect(inviteRepo.getByToken("old-token")).toBeUndefined();
  });

  it("removes a tenant user and revokes their sessions", async () => {
    const tokenService = new FakeTokenService();
    const userRepo = new FakeUserRepository();
    const sessionStore = new FakeSessionStore();
    const uc = new RemoveOrganizationUserUseCase(
      userRepo,
      tokenService,
      sessionStore,
    );

    await userRepo.save({
      id: "admin-1", email: "admin@co.com", passwordHash: "hash",
      role: Role.ENTERPRISE_ADMIN, tenantId: "tenant-1",
    });
    await userRepo.save({
      id: "user-1", email: "dispatcher@co.com", passwordHash: "hash",
      role: Role.DISPATCHER, tenantId: "tenant-1",
    });

    const target = AuthUser.create({
      id: "user-1",
      email: "dispatcher@co.com",
      role: Role.DISPATCHER,
      tenantId: "tenant-1",
    });
    await sessionStore.save("target-session", target);

    const accessToken = tokenService.issueAccessToken(
      AuthUser.create({
        id: "admin-1",
        email: "admin@co.com",
        role: Role.ENTERPRISE_ADMIN,
        tenantId: "tenant-1",
      }),
    );

    const result = await uc.execute({
      accessToken,
      targetUserId: "user-1",
    });

    expect(result.message).toBe("User removed from organization");
    expect(userRepo.getById("user-1")).toBeUndefined();
    expect(sessionStore.size).toBe(0);
  });
});

describe("LogoutUseCase", () => {
  it("deletes the refresh session", async () => {
    const sessionStore = new FakeSessionStore();
    const tokenService = new FakeTokenService();
    const uc = new LogoutUseCase(sessionStore, tokenService);

    const user = AuthUser.create({
      id: "u-1", email: "user@co.com",
      role: Role.FLEET_ADMIN, tenantId: "t-1",
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
      id: "u-1", email: "user@co.com",
      role: Role.FLEET_ADMIN, tenantId: "t-1",
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
