import { Inject, Injectable, Optional } from "@nestjs/common";
import { TenantOrganizationTypeReader } from "../../../../../tenant-organization-type.reader";
import { InvalidAccessTokenError } from "../../domain/errors/invalid-access-token.error";
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
    @Optional()
    @Inject(TenantOrganizationTypeReader)
    private readonly organizationTypes?: TenantOrganizationTypeReader,
  ) {}

  async execute(authorizationHeader?: string) {
    const token = this.extractBearerToken(authorizationHeader);
    if (!token) {
      throw new InvalidAccessTokenError();
    }
    const actor = await resolveActorUser(token, this.tokenService, this.userRepo);

    return {
      id: actor.id,
      email: actor.email,
      fullName: actor.profile?.fullName ?? null,
      role: actor.role,
      tenantId: actor.tenantId,
      organizationType: (await this.organizationTypes?.of(actor.tenantId)) ?? null,
      accountStatus: actor.accountStatus,
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
