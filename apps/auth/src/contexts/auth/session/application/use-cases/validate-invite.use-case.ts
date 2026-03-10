import { Inject, Injectable } from "@nestjs/common";
import { INVITE_REPOSITORY, type InviteRepository } from "../../domain/ports/invite-repository.port";
import { InviteNotFoundError } from "../../domain/errors/invite-not-found.error";

@Injectable()
export class ValidateInviteUseCase {
  constructor(
    @Inject(INVITE_REPOSITORY)
    private readonly inviteRepo: InviteRepository,
  ) {}

  async execute(token: string) {
    const invite = await this.inviteRepo.findByToken(token);

    if (!invite || invite.status !== "pending" || invite.expiresAt < new Date()) {
      throw new InviteNotFoundError();
    }

    return {
      email: invite.email,
      role: invite.role,
      tenantId: invite.tenantId,
    };
  }
}
