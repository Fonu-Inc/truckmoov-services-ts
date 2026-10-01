import { Controller, Get, Headers, Inject, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Portals } from '@shared/access';
import { InternalCallerService, type IncomingHeaders } from './internal-caller.service';
import { TENANT_SUSPENSION_REPOSITORY, type TenantSuspensionRepository } from './tenant-suspension.repository';

const SUSPENSION_CALLERS = ['tracking', 'realtime'];

/** Every suspended tenant, for services that gate their own traffic on it. */
@ApiExcludeController()
@Portals('service')
@Controller('internal/suspensions')
export class SuspensionsController {
  constructor(
    @Inject(InternalCallerService) private readonly callers: InternalCallerService,
    @Inject(TENANT_SUSPENSION_REPOSITORY) private readonly suspensions: TenantSuspensionRepository,
  ) {}

  @Get()
  async list(@Headers() headers: IncomingHeaders) {
    if (!(await this.callers.serviceFor(headers, SUSPENSION_CALLERS))) {
      throw new UnauthorizedException('Invalid service token');
    }
    const rows = await this.suspensions.findAll();
    return {
      status: true,
      message: 'success',
      data: {
        tenants: rows.map((row) => ({
          tenantId: row.tenantId,
          cause: row.cause,
          reason: row.reason,
          since: row.suspendedAt.toISOString(),
        })),
      },
    };
  }
}
