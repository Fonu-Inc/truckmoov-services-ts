import { Controller, Get, Headers, Inject, Param, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Portals } from '@shared/access';
import { InstallerDeviceScopeUseCase } from '@auth/installation';
import { InternalCallerService, type IncomingHeaders } from './internal-caller.service';
import { ok } from './installation-http';

/** Fleet asks here which devices an installer may read; the answer decides every installer route there. */
@ApiExcludeController()
@Portals('service')
@Controller('internal/installers')
export class InternalInstallersController {
  constructor(
    @Inject(InstallerDeviceScopeUseCase) private readonly scope: InstallerDeviceScopeUseCase,
    @Inject(InternalCallerService) private readonly callers: InternalCallerService,
  ) {}

  @Get(':userId/device-scope')
  async deviceScope(@Param('userId') userId: string, @Headers() headers: IncomingHeaders) {
    if (!(await this.callers.serviceFor(headers, ['fleet']))) {
      throw new UnauthorizedException('Invalid service token');
    }
    return ok(await this.scope.forUser(userId));
  }
}
