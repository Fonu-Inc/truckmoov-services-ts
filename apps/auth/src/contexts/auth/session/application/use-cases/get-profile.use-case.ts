import { Inject, Injectable } from "@nestjs/common";
import {
  TOKEN_SERVICE,
  type TokenService,
} from "../../domain/ports/token-service.port";
import {
  USER_REPOSITORY,
  type UserRepository,
} from "../../domain/ports/user-repository.port";
import { resolveActorUser } from "./support/resolve-actor-user";

@Injectable()
export class GetProfileUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
  ) {}

  async execute(accessToken: string) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepo,
    );

    return {
      userId: actor.id,
      username: actor.username,
      tenantId: actor.tenantId,
      roles: actor.roles,
      profile: actor.profile,
    };
  }
}
