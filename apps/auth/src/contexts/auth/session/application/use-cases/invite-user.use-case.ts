import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { MailerService } from "@shared/mailer";
import { AppConfigService } from "@shared/config";
import { Role, INVITABLE_ROLES, hasPermission, Permission } from "@shared/rbac";
import { INVITE_REPOSITORY, type InviteRepository } from "../../domain/ports/invite-repository.port";
import { TOKEN_SERVICE, type TokenService } from "../../domain/ports/token-service.port";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
import { INVITE_USER_SUBJECT, INVITE_USER_TEMPLATE } from "@auth/templates/invite-user.template";

export type InviteUserCommand = {
  email: string;
  role: string;
  accessToken: string;
};

@Injectable()
export class InviteUserUseCase {
  constructor(
    @Inject(INVITE_REPOSITORY)
    private readonly inviteRepo: InviteRepository,
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(MailerService)
    private readonly mailer: MailerService,
    @Inject(AppConfigService)
    private readonly config: AppConfigService,
  ) {}

  async execute(command: InviteUserCommand) {
    const caller = this.tokenService.resolveAccessToken(command.accessToken);
    if (!caller) throw new ForbiddenError();

    const callerRole = caller.roles[0] as Role;
    if (!hasPermission(callerRole, Permission.USER_INVITE)) {
      throw new ForbiddenError();
    }

    const targetRole = command.role as Role;
    if (!(INVITABLE_ROLES as readonly string[]).includes(targetRole)) {
      throw new ForbiddenError("Cannot invite users with this role");
    }

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    await this.inviteRepo.save({
      id: randomUUID(),
      email: command.email,
      role: targetRole,
      tenantId: caller.tenantId,
      token,
      invitedBy: caller.id,
      status: "pending",
      expiresAt,
      createdAt: new Date(),
    });

    const inviteLink = `${this.config.app.frontendUrl}/register?invite=${token}`;

    await this.mailer.send({
      to: command.email,
      subject: INVITE_USER_SUBJECT,
      template: INVITE_USER_TEMPLATE,
      variables: {
        role: formatRole(targetRole),
        inviteLink,
        year: String(new Date().getFullYear()),
      },
    });

    return { message: "Invitation sent", email: command.email, role: targetRole };
  }
}

function formatRole(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
