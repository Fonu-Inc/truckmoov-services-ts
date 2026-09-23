import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Portals, Requires } from '@shared/access';
import { ForbiddenError } from './contexts/auth/session';
import { ScheduleRemovalDto, StaffRoleDto } from './dto/governance.dto';
import {
  GovernanceUseCases,
  InvalidRemovalError,
  RemovalNotCancellableError,
  RemovalNotFoundError,
} from './governance.use-cases';
import type { PermissionRemovalStatus } from './permission-removal.repository';

function bearer(authorization?: string): string {
  const [scheme, token] = (authorization ?? '').split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) throw new UnauthorizedException('Missing authorization');
  return token;
}

async function mapped<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof InvalidRemovalError) throw new BadRequestException(error.message);
    if (error instanceof RemovalNotFoundError) throw new NotFoundException(error.message);
    if (error instanceof RemovalNotCancellableError) throw new ConflictException(error.message);
    if (error instanceof ForbiddenError) throw new ForbiddenException();
    throw error;
  }
}

const ok = (data: unknown, message = 'success') => ({ status: true, message, data });

@ApiTags('System governance')
@ApiBearerAuth()
@Portals('admin')
@Controller('system/governance')
export class GovernanceController {
  constructor(@Inject(GovernanceUseCases) private readonly governance: GovernanceUseCases) {}

  @Get('tenants/:tenantId')
  @Requires('admin.governance.read')
  @ApiOperation({ summary: "A tenant's roles, what each grants, who holds them, and its removals" })
  async review(@Param('tenantId') tenantId: string, @Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.governance.review(bearer(authorization), tenantId)));
  }

  @Get('removals')
  @Requires('admin.governance.read')
  @ApiOperation({ summary: 'Scheduled, applied and cancelled permission removals' })
  async list(
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: PermissionRemovalStatus,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(await mapped(() => this.governance.list(bearer(authorization), { tenantId, status })));
  }

  @Post('removals')
  @Requires('admin.governance.manage')
  @ApiOperation({ summary: 'Schedule a permission removal from a tenant, effective on a future date' })
  async schedule(@Body() body: ScheduleRemovalDto, @Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.governance.schedule(bearer(authorization), body)), 'Removal scheduled');
  }

  @Post('removals/:removalId/cancel')
  @Requires('admin.governance.manage')
  @ApiOperation({ summary: 'Cancel a removal that has not taken effect yet' })
  async cancel(@Param('removalId') removalId: string, @Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.governance.cancel(bearer(authorization), removalId)), 'Removal cancelled');
  }
}

@ApiTags('System governance')
@ApiBearerAuth()
@Portals('admin')
@Controller('system/admins')
export class StaffRolesController {
  constructor(@Inject(GovernanceUseCases) private readonly governance: GovernanceUseCases) {}

  @Patch(':userId/role')
  @Requires('admin.staff.manage')
  @ApiOperation({ summary: "Change a staff member's role; the changer must hold everything it grants" })
  async setRole(@Param('userId') userId: string, @Body() body: StaffRoleDto, @Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.governance.setStaffRole(bearer(authorization), userId, body.role)), 'Role changed');
  }
}
