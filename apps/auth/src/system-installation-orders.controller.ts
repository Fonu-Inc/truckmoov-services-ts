import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Portals, Requires } from '@shared/access';
import { INSTALLATION_ORDER_STATUSES } from './contexts/installation/domain/installation-order';
import { ManageInstallationOrdersUseCases } from './contexts/installation/application/use-cases/manage-installation-orders.use-cases';
import { AdminJobChangesUseCases } from './contexts/installation/application/use-cases/admin-job-changes.use-cases';
import { BindUnitDeviceDto, ResolveInstallationIssueDto, UpdateInstallationOrderDto } from './dto/installer-portal.dto';
import { bearer, jobStatusFilter, mapped, numeric, ok } from './installation-http';

@ApiTags('System installation orders')
@ApiBearerAuth()
@Portals('admin')
@Controller('system/installation-orders')
export class SystemInstallationOrdersController {
  constructor(
    @Inject(ManageInstallationOrdersUseCases) private readonly orders: ManageInstallationOrdersUseCases,
    @Inject(AdminJobChangesUseCases) private readonly changes: AdminJobChangesUseCases,
  ) {}

  @Get()
  @Requires('admin.installations.read')
  @ApiOperation({ summary: 'Installation jobs across every customer and installer' })
  @ApiQuery({ name: 'status', required: false, enum: INSTALLATION_ORDER_STATUSES })
  @ApiQuery({ name: 'installerId', required: false })
  @ApiQuery({ name: 'search', required: false, description: 'Job number, customer, vehicle registration, city or state' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @Query('status') status?: string,
    @Query('installerId') installerId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const query = { status: jobStatusFilter(status), installerId, search, page: numeric(page), limit: numeric(limit) };
    return ok(await mapped(() => this.orders.list(bearer(authorization), query)));
  }

  @Put(':id/units/:deviceIndex')
  @Requires('admin.installations.manage')
  @ApiOperation({ summary: "Bind the fleet device fitted as a unit; it must be in the order's customer fleet" })
  async bindUnit(
    @Param('id') id: string,
    @Param('deviceIndex', new ParseIntPipe({ exceptionFactory: () => new BadRequestException('deviceIndex must be a number') }))
    deviceIndex: number,
    @Body() body: BindUnitDeviceDto,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await mapped(() => this.orders.bindUnitDevice(bearer(authorization), id, deviceIndex, body.fleetDeviceId)),
      'Device bound',
    );
  }

  @Patch(':id')
  @Requires('admin.installations.manage')
  @ApiOperation({ summary: 'Reschedule or edit the site details; an overdue job given a new date is scheduled again' })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateInstallationOrderDto,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(await mapped(() => this.changes.updateDetails(bearer(authorization), id, body)), 'Installation updated');
  }

  @Post(':id/resolve-issue')
  @Requires('admin.installations.manage')
  @ApiOperation({ summary: 'Resolve a reported issue: resume where it stopped, or cancel the job' })
  async resolveIssue(
    @Param('id') id: string,
    @Body() body: ResolveInstallationIssueDto,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await mapped(() => this.changes.resolveIssue(bearer(authorization), id, body.outcome, body.note)),
      'Issue resolved',
    );
  }
}
