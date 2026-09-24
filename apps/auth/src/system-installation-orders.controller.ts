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
  applyDecorators,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Portals, Requires } from '@shared/access';
import { INSTALLATION_ORDER_STATUSES } from './contexts/installation/domain/installation-order';
import { ManageInstallationOrdersUseCases } from './contexts/installation/application/use-cases/manage-installation-orders.use-cases';
import { AdminJobChangesUseCases } from './contexts/installation/application/use-cases/admin-job-changes.use-cases';
import { BindUnitDeviceDto, ResolveInstallationIssueDto, UpdateInstallationOrderDto } from './dto/installer-portal.dto';
import { bearer, jobStatusFilter, mapped, numeric, ok } from './installation-http';
import { ApiErrorBody, ApiErrorResponse, ApiValidationErrorBody } from './dto/api-error.dto';
import {
  BoundUnitResponse,
  InstallationJobChangeResponse,
  InstallationJobPageResponse,
} from './dto/installation-response.dto';

const REFUSED_AS_NOT_FOUND =
  'Under PORTAL_ENFORCEMENT or PERMISSION_ENFORCEMENT=enforce, a refused caller gets "Cannot <METHOD> <path>" here instead of a 403.';
const JOB_NOT_FOUND = '"Installation job not found"';
const JOB_CLOSED = '"A completed or cancelled installation cannot be changed"';
const JOB_CHANGED = '"This job changed while the request was in flight. Reload it and try again."';

const StaffErrors = (notFound?: string) =>
  applyDecorators(
    ApiErrorResponse(
      401,
      '"Missing authorization" without a bearer token. Under PORTAL_ENFORCEMENT=enforce the guard answers an invalid one with "missing or invalid authorization".',
    ),
    ApiErrorResponse(
      403,
      'Not an active admin holding the permission, or an invalid token: "You do not have permission to perform this action".',
    ),
    ApiErrorResponse(404, notFound ? `${notFound}. ${REFUSED_AS_NOT_FOUND}` : REFUSED_AS_NOT_FOUND),
  );

const InvalidBody = (rules: string) =>
  ApiErrorResponse(
    400,
    `${rules} An unknown or mistyped property: the ValidationPipe array body.`,
    ApiErrorBody,
    ApiValidationErrorBody,
  );

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
  @ApiQuery({ name: 'limit', required: false, description: 'Default 20, at most 100' })
  @ApiOkResponse({ description: 'Page of jobs, newest first', type: InstallationJobPageResponse })
  @ApiErrorResponse(400, '"status must be one of: <statuses>"')
  @StaffErrors()
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
  @ApiOkResponse({ description: 'Device bound. message is "Device bound".', type: BoundUnitResponse })
  @InvalidBody('"deviceIndex must be a number".')
  @StaffErrors(`${JOB_NOT_FOUND}, or "Unit <n> is not on this installation"`)
  @ApiErrorResponse(409, JOB_CLOSED)
  @ApiErrorResponse(
    422,
    '"This device is not in the customer\'s fleet", or "This device is already bound to another installation unit"',
  )
  @ApiErrorResponse(503, '"The device service could not be reached"')
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
  @ApiOkResponse({ description: 'Installation updated', type: InstallationJobChangeResponse })
  @InvalidBody(
    '"Nothing to change", a field rule such as the phone or address, or the date ("The installation date is not a date", "An installation must be booked at least one day ahead", "An installation cannot be booked more than 90 days ahead"). These carry no field key.',
  )
  @StaffErrors(JOB_NOT_FOUND)
  @ApiErrorResponse(409, `${JOB_CLOSED}, "A job that is <status> cannot be rescheduled or edited", or ${JOB_CHANGED}`)
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
  @ApiCreatedResponse({ description: 'Issue resolved', type: InstallationJobChangeResponse })
  @InvalidBody('"outcome must be one of: resume, cancel", or "note must be 1000 characters or fewer".')
  @StaffErrors(JOB_NOT_FOUND)
  @ApiErrorResponse(
    409,
    `"Only a job with a reported issue can be resolved", "This job has no status to resume", "An installation cannot move from <from> to <to>", or ${JOB_CHANGED}`,
  )
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
