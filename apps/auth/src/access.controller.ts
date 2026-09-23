import { Controller, Get, Headers, Inject, NotFoundException, Param, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController, ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Portals, SignedIn } from '@shared/access';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { AccessResolver } from './access-resolver';
import { InternalCallerService, type IncomingHeaders } from './internal-caller.service';

const ACCESS_CALLERS = ['fleet', 'dispatch', 'notification', 'tracking', 'realtime'];

/** Every other service asks here what a user may do, instead of trusting the token. */
@ApiExcludeController()
@Portals('service')
@Controller('internal/access')
export class InternalAccessController {
  constructor(
    @Inject(AccessResolver) private readonly resolver: AccessResolver,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(InternalCallerService) private readonly callers: InternalCallerService,
  ) {}

  @Get(':userId')
  async access(@Param('userId') userId: string, @Headers() headers: IncomingHeaders) {
    if (!(await this.callers.serviceFor(headers, ACCESS_CALLERS))) {
      throw new UnauthorizedException('Invalid service token');
    }
    const access = await this.resolver.resolve(this.users, userId);
    if (!access) throw new NotFoundException();
    return { status: true, message: 'success', data: access };
  }
}

/** What the signed-in user can do, and nothing about what exists beyond that. */
@ApiTags('Auth')
@Portals('tenant', 'admin')
@SignedIn()
@Controller('capabilities')
export class CapabilitiesController {
  constructor(
    @Inject(AccessResolver) private readonly resolver: AccessResolver,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
  ) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: "The signed-in user's permissions, for deciding which features to show" })
  @ApiOkResponse({ description: 'Portal and permissions' })
  async capabilities(@Headers('authorization') authorization?: string) {
    const [scheme, token] = (authorization ?? '').split(' ');
    const user = scheme?.toLowerCase() === 'bearer' && token ? this.tokens.resolveAccessToken(token) : null;
    const access = user ? await this.resolver.resolve(this.users, user.id) : null;
    if (!access?.active) throw new UnauthorizedException('missing or invalid authorization');
    return { status: true, message: 'success', data: { portal: access.portal, permissions: access.permissions } };
  }
}
