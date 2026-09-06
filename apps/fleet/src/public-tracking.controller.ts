import { Controller, Get, GoneException, Inject, Param } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Public } from "@shared/rbac";
import {
  ShareLinkExpiredError,
  ViewSharedLocationUseCase,
} from "./contexts/fleet/tracking/application/share-location.use-cases";

/**
 * The customer-facing tracking link.
 *
 * Unauthenticated by design: the recipient is someone waiting on a delivery,
 * not a user of the platform. It is deliberately not `@TenantScoped()` — the
 * tenant comes from the token, and there is no session to read one from.
 *
 * Excluded from the public documentation: the URL is only ever useful with a
 * token, and listing it invites enumeration.
 */
@ApiExcludeController()
@Public()
@Controller("track")
export class PublicTrackingController {
  constructor(
    @Inject(ViewSharedLocationUseCase) private readonly viewShared: ViewSharedLocationUseCase,
  ) {}

  @Get(":token")
  async view(@Param("token") token: string) {
    try {
      return { status: true, message: "success", data: await this.viewShared.execute(token) };
    } catch (error) {
      // Expired, revoked and never-existed are one answer. Telling them apart
      // would let someone with a guessed token learn that it was once real.
      if (error instanceof ShareLinkExpiredError) {
        throw new GoneException("This tracking link is no longer available");
      }
      throw error;
    }
  }
}
