import { Inject, Injectable } from "@nestjs/common";
import { AuthUser } from "../../domain/entities/auth-user.entity";
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
export class GetMeUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
  ) {}

  async execute(authorizationHeader?: string) {
    const token = this.extractBearerToken(authorizationHeader);
    const actor = token
      ? await resolveActorUser(token, this.tokenService, this.userRepo)
      : null;

    if (actor) {
      return {
        id: actor.id,
        email: actor.email,
        fullName: actor.profile?.fullName ?? null,
        role: actor.role,
        tenantId: actor.tenantId,
        accountStatus: actor.accountStatus,
        tokenPreview: authorizationHeader?.slice(0, 18) ?? null,
      };
    }

    const resolvedUser = AuthUser.create({
      id: "dev-user",
      email: "dev-admin",
      role: "admin",
      tenantId: "dev-tenant",
    });

    return {
      ...resolvedUser.toPrimitives(),
      accountStatus: "enabled",
      tokenPreview: authorizationHeader?.slice(0, 18) ?? null,
    };
  }

  private extractBearerToken(header?: string) {
    if (!header) {
      return null;
    }

    const [scheme, token] = header.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      return null;
    }

    return token;
  }
}
