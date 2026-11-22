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
import type { JobSort } from './contexts/installation/domain/installation-job.reader';
import { ManageInstallationOrdersUseCases } from './contexts/installation/application/use-cases/manage-installation-orders.use-cases';
import { AdminJobChangesUseCases } from './contexts/installation/application/use-cases/admin-job-changes.use-cases';
import {
  AssignInstallationOrderDto,
  BindUnitDeviceDto,
  ResolveInstallationIssueDto,
  UpdateInstallationOrderDto,
} from './dto/installer-portal.dto';
import { bearer, jobStatusFilter, mapped, numeric, ok } from './installation-http';
import { ApiErrorBody, ApiErrorResponse, ApiValidationErrorBody } from './dto/api-error.dto';
import {
  BoundUnitResponse,
  InstallationJobAssignmentResponse,
  InstallationJobChangeResponse,
  InstallationJobDetailResponse,
  InstallationJobPageResponse,
} from './dto/installation-response.dto';

const JOB_SORTS: readonly JobSort[] = ['newest', 'scheduled', 'completion'];
const TENANT_TYPES = ['enterprise', 'owner_operator'] as const;
const ASSIGNMENTS = ['assigned', 'unassigned'] as const;

function oneOf<T extends string>(field: string, value: string | undefined, allowed: readonly T[]): T | undefined {
  if (!value) return undefined;
  if (!(allowed as readonly string[]).includes(value)) throw new BadRequestException(`${field} must be one of: ${allowed.join(', ')}`);
  return value as T;
}

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
  @ApiQuery({ name: 'status', required: false, description: `One or more of ${INSTALLATION_ORDER_STATUSES.join(', ')}, comma-separated` })
  @ApiQuery({ name: 'installerId', required: false })
  @ApiQuery({ name: 'search', required: false, description: 'Job number, customer, vehicle registration, city or state' })
  @ApiQuery({ name: 'tenantType', required: false, enum: ['enterprise', 'owner_operator'] })
  @ApiQuery({ name: 'assignment', required: false, enum: ['assigned', 'unassigned'], description: 'Whether an installer is on the job' })
  @ApiQuery({ name: 'scheduledFrom', required: false, description: 'YYYY-MM-DD booked date, inclusive' })
  @ApiQuery({ name: 'scheduledTo', required: false, description: 'YYYY-MM-DD booked date, inclusive' })
  @ApiQuery({ name: 'startedFrom', required: false, description: 'YYYY-MM-DD Lagos day, inclusive' })
  @ApiQuery({ name: 'startedTo', required: false, description: 'YYYY-MM-DD Lagos day, inclusive' })
  @ApiQuery({ name: 'completedFrom', required: false, description: 'YYYY-MM-DD Lagos day of completion or cancellation, inclusive' })
  @ApiQuery({ name: 'completedTo', required: false, description: 'YYYY-MM-DD Lagos day of completion or cancellation, inclusive' })
  @ApiQuery({ name: 'createdFrom', required: false, description: 'YYYY-MM-DD Lagos day, inclusive' })
  @ApiQuery({ name: 'createdTo', required: false, description: 'YYYY-MM-DD Lagos day, inclusive' })
  @ApiQuery({ name: 'sort', required: false, enum: JOB_SORTS, description: 'Default newest' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false, description: 'Default 20, at most 100' })
  @ApiOkResponse({
    description: 'Page of jobs. countsByStatus counts every status under the same filters, status aside.',
    type: InstallationJobPageResponse,
  })
  @ApiErrorResponse(
    400,
    '"status must be one of: <statuses>", "sort must be one of: <sorts>", "tenantType must be one of: enterprise, owner_operator", "assignment must be one of: assigned, unassigned", or "<field> must be a date (YYYY-MM-DD)"',
  )
  @StaffErrors()
  async list(
    @Query() q: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    const query = {
      statuses: q.status ? String(q.status).split(',').flatMap((s) => jobStatusFilter(s.trim()) ?? []) : undefined,
      installerId: q.installerId,
      search: q.search,
      tenantType: oneOf('tenantType', q.tenantType, TENANT_TYPES),
      assigned: q.assignment ? oneOf('assignment', q.assignment, ASSIGNMENTS) === 'assigned' : undefined,
      scheduledFrom: q.scheduledFrom,
      scheduledTo: q.scheduledTo,
      startedFrom: q.startedFrom,
      startedTo: q.startedTo,
      completedFrom: q.completedFrom,
      completedTo: q.completedTo,
      createdFrom: q.createdFrom,
      createdTo: q.createdTo,
      sort: oneOf('sort', q.sort, JOB_SORTS),
      page: numeric(q.page),
      limit: numeric(q.limit),
    };
    return ok(await mapped(() => this.orders.list(bearer(authorization), query)));
  }

  @Post(':id/assign')
  @Requires('admin.installations.manage')
  @ApiOperation({
    summary: 'Assign an installer to an installation job',
    description:
      'Puts a named active installer on the booking and schedules it. Reassigning a scheduled or overdue job keeps that status; a job whose work has started cannot be reassigned.',
  })
  @ApiCreatedResponse({ description: 'Installer assigned', type: InstallationJobAssignmentResponse })
  @InvalidBody('"installerId must be a string".')
  @StaffErrors(`${JOB_NOT_FOUND}, or "Installer not found"`)
  @ApiErrorResponse(409, `${JOB_CLOSED}, "A job that is <status> cannot be assigned", the installer is at capacity or already booked for the slot, or ${JOB_CHANGED}`)
  async assignInstaller(
    @Param('id') id: string,
    @Body() body: AssignInstallationOrderDto,
    @Headers('authorization') authorization?: string,
  ) {
    return ok(
      await mapped(() => this.changes.assignInstaller(bearer(authorization), id, body.installerId)),
      'Installer assigned',
    );
  }

  @Get(':id')
  @Requires('admin.installations.read')
  @ApiOperation({ summary: 'One installation job, with every installer who rejected the offer and why' })
  @ApiOkResponse({ description: 'The job', type: InstallationJobDetailResponse })
  @StaffErrors(JOB_NOT_FOUND)
  async detail(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    return ok(await mapped(() => this.orders.detail(bearer(authorization), id)));
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
