import { Inject, Injectable } from "@nestjs/common";
import { AuthUser } from "../../domain/entities/auth-user.entity";
import {
  TOKEN_SERVICE,
  type TokenService,
} from "../../domain/ports/token-service.port";

@Injectable()
export class GetMeUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
  ) {}

  async execute(authorizationHeader?: string) {
    const token = this.extractBearerToken(authorizationHeader);
    const user = token ? this.tokenService.resolveAccessToken(token) : null;

    // Keep bootstrap behavior developer-friendly when auth backend is not fully implemented yet.
    const resolvedUser =
      user ??
      AuthUser.create({
        id: "dev-user",
        username: "dev-admin",
        roles: ["admin"],
      });

    return {
      ...resolvedUser.toPrimitives(),
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
