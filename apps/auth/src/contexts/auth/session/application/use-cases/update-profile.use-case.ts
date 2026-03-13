import { Inject, Injectable } from "@nestjs/common";
import {
  TOKEN_SERVICE,
  type TokenService,
} from "../../domain/ports/token-service.port";
import {
  USER_REPOSITORY,
  type UserRepository,
  type UserProfile,
} from "../../domain/ports/user-repository.port";
import { resolveActorUser } from "./support/resolve-actor-user";

export type UpdateProfileCommand = {
  accessToken: string;
  fullName?: string;
  phoneNumber?: string;
};

@Injectable()
export class UpdateProfileUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
  ) {}

  async execute(command: UpdateProfileCommand) {
    const actor = await resolveActorUser(
      command.accessToken,
      this.tokenService,
      this.userRepo,
    );

    const mergedProfile: UserProfile = {
      fullName:
        command.fullName === undefined
          ? actor.profile!.fullName
          : this.toNullableTrimmedString(command.fullName),
      phoneNumber:
        command.phoneNumber === undefined
          ? actor.profile!.phoneNumber
          : this.toNullableTrimmedString(command.phoneNumber),
    };

    await this.userRepo.updateProfile(actor.id, mergedProfile);

    return {
      userId: actor.id,
      email: actor.email,
      tenantId: actor.tenantId,
      role: actor.role,
      profile: mergedProfile,
    };
  }

  private toNullableTrimmedString(value: string): string | null {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
}
