import { Inject, Injectable } from "@nestjs/common";
import { Role } from "@shared/rbac";
import { ForbiddenError } from "../../domain/errors/forbidden.error";
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
export class GetDispatcherPreferencesUseCase {
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

    if (!actor.roles.includes(Role.DISPATCHER)) {
      throw new ForbiddenError(
        "Only dispatchers can view working hours and timezone settings",
      );
    }

    return {
      userId: actor.id,
      dispatcherPreferences: actor.dispatcherPreferences,
    };
  }
}
