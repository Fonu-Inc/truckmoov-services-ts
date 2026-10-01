import {
  Res,
  ForbiddenException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  BadRequestException,
  ConflictException,
  Post,
  Inject,
  Headers,
  StreamableFile,
  Patch,
  UnauthorizedException,
  Query,
} from '@nestjs/common';
import {
  ApiUnauthorizedResponse,
  ApiOkResponse,
  ApiForbiddenResponse,
  ApiTags,
  ApiProduces,
  ApiNotFoundResponse,
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiOperation,
  ApiQuery,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import {
  AssignSystemSupportTicketUseCase,
  AssigneeNotSupportStaffError,
} from './assign-system-support-ticket.use-case';
import {
  AssignSystemDeviceSetupRequestUseCase,
  DeviceSetupRequestNotReadyError,
} from './assign-system-device-setup-request.use-case';
import {
  ConfirmSystemDeviceSetupPaymentUseCase,
  DeviceSetupRequestNotAwaitingPaymentError,
} from './confirm-system-device-setup-payment.use-case';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { ForbiddenError } from './contexts/auth/session';
import {
  SystemSupportMessagesResponse,
  SystemSupportMessageActionResponse,
  SystemSupportTicketsListResponse,
  SystemDeviceSetupRequestsResponse,
  SystemDeviceSetupRequestDetailResponse,
  SystemSupportDashboardResponse,
  SystemSupportTicketActionResponse,
  SystemEscalatedTicketsResponse,
  SystemSupportTicketDetailResponse,
} from './dto/auth.schema';
import {
  ApproveDeviceSetupRequestDto,
  AssignDeviceSetupRequestDto,
  ConfirmDeviceSetupPaymentDto,
  RejectDeviceSetupRequestDto,
} from './dto/device-setup.dto';
import {
  TICKET_CATEGORIES,
  AssignTicketDto,
  UpdateTicketStatusDto,
  EscalateTicketDto,
  SendSupportMessageDto,
} from './dto/support.dto';
import { InvalidEscalationTargetError, EscalateSystemSupportTicketUseCase } from './escalate-system-support-ticket.use-case';
import { DeviceSetupRequestUnpricedError } from './device-setup-request-pricing.service';
import { InstallerNotFoundError, InstallerStateError } from './contexts/installation/domain/installer';
import { ExportSystemDeviceSetupRequestsUseCase } from './export-system-device-setup-requests.use-case';
import { ExportSystemSupportTicketsUseCase } from './export-system-support-tickets.use-case';
import { DeviceSetupRequestNotFoundError, GetSystemDeviceSetupRequestUseCase } from './get-system-device-setup-request.use-case';
import { GetSystemSupportDashboardUseCase } from './get-system-support-dashboard.use-case';
import { GetSystemSupportTicketUseCase } from './get-system-support-ticket.use-case';
import { ListSystemDeviceSetupRequestsUseCase } from './list-system-device-setup-requests.use-case';
import { ListSystemEscalatedTicketsUseCase } from './list-system-escalated-tickets.use-case';
import { ListSystemSupportTicketMessagesUseCase } from './list-system-support-ticket-messages.use-case';
import { ListSystemSupportTicketsUseCase } from './list-system-support-tickets.use-case';
import {
  ApproveSystemDeviceSetupRequestUseCase,
  DeviceSetupRejectionReasonRequiredError,
  DeviceSetupRequestAlreadyDecidedError,
  GetSystemDeviceSetupSummaryUseCase,
  RejectSystemDeviceSetupRequestUseCase,
} from './decide-system-device-setup-request.use-cases';
import { SendSystemSupportMessageUseCase } from './send-system-support-message.use-case';
import { InvalidTicketStatusError, UpdateSystemSupportTicketStatusUseCase } from './update-system-support-ticket-status.use-case';
import { Portals, OnResource } from '@shared/access';
import { DEVICE_SETUP_REQUEST_STATUSES } from '@shared/devices';
import { SUPPORT_TICKET_REPORTER_TYPES, type SupportTicketReporterType } from './support-ticket.repository';

function reporterTypeFilter(value?: string): SupportTicketReporterType | undefined {
  if (!value) return undefined;
  if (!(SUPPORT_TICKET_REPORTER_TYPES as readonly string[]).includes(value)) {
    throw new BadRequestException(`reporterType must be one of: ${SUPPORT_TICKET_REPORTER_TYPES.join(', ')}`);
  }
  return value as SupportTicketReporterType;
}

@ApiTags('System Support')
@Portals('admin')
@OnResource('admin.support')
@Controller('system/support')
export class SystemSupportController extends BaseAuthController {
  constructor(
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
    @Inject(GetSystemSupportDashboardUseCase) private readonly getSystemSupportDashboardUseCase: GetSystemSupportDashboardUseCase,
    @Inject(ListSystemSupportTicketsUseCase) private readonly listSystemSupportTicketsUseCase: ListSystemSupportTicketsUseCase,
    @Inject(GetSystemSupportTicketUseCase) private readonly getSystemSupportTicketUseCase: GetSystemSupportTicketUseCase,
    @Inject(UpdateSystemSupportTicketStatusUseCase) private readonly updateSystemSupportTicketStatusUseCase: UpdateSystemSupportTicketStatusUseCase,
    @Inject(AssignSystemSupportTicketUseCase) private readonly assignSystemSupportTicketUseCase: AssignSystemSupportTicketUseCase,
    @Inject(EscalateSystemSupportTicketUseCase) private readonly escalateSystemSupportTicketUseCase: EscalateSystemSupportTicketUseCase,
    @Inject(ListSystemSupportTicketMessagesUseCase) private readonly listSystemSupportTicketMessagesUseCase: ListSystemSupportTicketMessagesUseCase,
    @Inject(SendSystemSupportMessageUseCase) private readonly sendSystemSupportMessageUseCase: SendSystemSupportMessageUseCase,
    @Inject(ExportSystemSupportTicketsUseCase) private readonly exportSystemSupportTicketsUseCase: ExportSystemSupportTicketsUseCase,
    @Inject(ListSystemEscalatedTicketsUseCase) private readonly listSystemEscalatedTicketsUseCase: ListSystemEscalatedTicketsUseCase,
    @Inject(ListSystemDeviceSetupRequestsUseCase) private readonly listSystemDeviceSetupRequestsUseCase: ListSystemDeviceSetupRequestsUseCase,
    @Inject(ExportSystemDeviceSetupRequestsUseCase) private readonly exportSystemDeviceSetupRequestsUseCase: ExportSystemDeviceSetupRequestsUseCase,
    @Inject(GetSystemDeviceSetupRequestUseCase) private readonly getSystemDeviceSetupRequestUseCase: GetSystemDeviceSetupRequestUseCase,
    @Inject(AssignSystemDeviceSetupRequestUseCase) private readonly assignSystemDeviceSetupRequestUseCase: AssignSystemDeviceSetupRequestUseCase,
    @Inject(RejectSystemDeviceSetupRequestUseCase) private readonly rejectSystemDeviceSetupRequestUseCase: RejectSystemDeviceSetupRequestUseCase,
    @Inject(ApproveSystemDeviceSetupRequestUseCase) private readonly approveSystemDeviceSetupRequestUseCase: ApproveSystemDeviceSetupRequestUseCase,
    @Inject(GetSystemDeviceSetupSummaryUseCase) private readonly getSystemDeviceSetupSummaryUseCase: GetSystemDeviceSetupSummaryUseCase,
    @Inject(ConfirmSystemDeviceSetupPaymentUseCase) private readonly confirmSystemDeviceSetupPaymentUseCase: ConfirmSystemDeviceSetupPaymentUseCase,
  ) {
    super(activityLogService);
  }

  @Get('dashboard')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Support dashboard stats' })
  @ApiOkResponse({ type: SystemSupportDashboardResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async getSystemSupportDashboard(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemSupportDashboardUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('escalated')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List escalated tickets grouped by escalation party' })
  @ApiOkResponse({ type: SystemEscalatedTicketsResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async listSystemEscalatedTickets(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listSystemEscalatedTicketsUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('device-setup')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List device setup requests' })
  @ApiQuery({ name: 'status', required: false, enum: DEVICE_SETUP_REQUEST_STATUSES })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Matches DVR reference, organisation, email, manufacturer, model or tenant' })
  @ApiQuery({ name: 'manufacturer', required: false, type: String })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'ISO date lower bound on createdAt' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'ISO date upper bound on createdAt' })
  @ApiOkResponse({ type: SystemDeviceSetupRequestsResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async listSystemDeviceSetupRequests(
    @Headers('authorization') authorization: string | undefined,
    @Query('status') status: string | undefined,
    @Query('search') search: string | undefined,
    @Query('manufacturer') manufacturer: string | undefined,
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listSystemDeviceSetupRequestsUseCase.execute(accessToken, {
        status,
        search,
        manufacturer,
        dateFrom,
        dateTo,
      });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('device-setup/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export device setup requests as CSV' })
  @ApiQuery({ name: 'status', required: false, enum: DEVICE_SETUP_REQUEST_STATUSES })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'manufacturer', required: false, type: String })
  @ApiQuery({ name: 'dateFrom', required: false, type: String })
  @ApiQuery({ name: 'dateTo', required: false, type: String })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV export', schema: { type: 'string', format: 'binary' } })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async exportSystemDeviceSetupRequests(
    @Headers('authorization') authorization: string | undefined,
    @Query('status') status: string | undefined,
    @Query('search') search: string | undefined,
    @Query('manufacturer') manufacturer: string | undefined,
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const exported = await this.exportSystemDeviceSetupRequestsUseCase.execute(accessToken, {
        status,
        search,
        manufacturer,
        dateFrom,
        dateTo,
      });
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
      return new StreamableFile(Buffer.from(exported.csv, 'utf8'));
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  // Declared AFTER the literal device-setup/export route so :requestId cannot
  // swallow `export`.

  @Get('device-setup/summary')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Device request approval counters',
    description: 'pendingApproval counts under_review; awaitingPayment counts awaiting_payment; approved counts awaiting_payment through completed; rejected; devicesRequested sums quantities.',
  })
  @ApiOkResponse({ description: 'Approval queue counters' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to view device setup requests' })
  async getSystemDeviceSetupSummary(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemDeviceSetupSummaryUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowDeviceSetupError(error);
      throw error;
    }
  }

  @Get('device-setup/:requestId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get device setup request detail' })
  @ApiOkResponse({ type: SystemDeviceSetupRequestDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  @ApiNotFoundResponse({ description: 'Device setup request not found' })
  async getSystemDeviceSetupRequest(
    @Param('requestId') requestId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemDeviceSetupRequestUseCase.execute(accessToken, requestId);
    } catch (error) {
      this.rethrowDeviceSetupError(error);
      throw error;
    }
  }

  @Patch('device-setup/:requestId/assign')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Assign a device setup request to an installer',
    description: 'Starts installation: ready_for_installation → installation_in_progress, assignedTo set to the installer. The installer completes it from the installer portal.',
  })
  @ApiOkResponse({ type: SystemDeviceSetupRequestDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to assign device setup requests' })
  @ApiNotFoundResponse({ description: 'Device setup request not found, or "Installer not found"' })
  @ApiBadRequestResponse({ description: 'installerId missing, or the request is not ready for installation' })
  @ApiConflictResponse({ description: 'The installer is not active (invited or suspended)' })
  async assignSystemDeviceSetupRequest(
    @Param('requestId') requestId: string,
    @Body(BodyOrDataPipe) payload: AssignDeviceSetupRequestDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.assignSystemDeviceSetupRequestUseCase.execute(accessToken, requestId, payload.installerId);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.device_setup.assigned',
        entityType: 'device_setup_request',
        entityId: requestId,
        summary: 'Device setup request assigned',
        metadata: { installerId: payload.installerId },
      });
      return result;
    } catch (error) {
      this.rethrowDeviceSetupError(error);
      throw error;
    }
  }

  @Patch('device-setup/:requestId/approve')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Approve a device setup request',
    description: 'Prices an under_review request (quantity × (tenant licence plan year-1 price + installation fee for its customer type)), stores the charges and moves it to awaiting_payment. Payment is auto-approved for now, so it continues straight to ready_for_installation; the timeline records both steps.',
  })
  @ApiOkResponse({ type: SystemDeviceSetupRequestDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to approve device setup requests' })
  @ApiNotFoundResponse({ description: 'Device setup request not found' })
  @ApiBadRequestResponse({ description: 'The request has already been decided' })
  @ApiConflictResponse({ description: '"This device request cannot be priced: <reason>", e.g. the tenant has no active licence plan. Nothing is approved.' })
  async approveSystemDeviceSetupRequest(
    @Param('requestId') requestId: string,
    @Body(BodyOrDataPipe) payload: ApproveDeviceSetupRequestDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.approveSystemDeviceSetupRequestUseCase.execute(
        accessToken,
        requestId,
        payload?.note,
      );
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.device_setup.approved',
        entityType: 'device_setup_request',
        entityId: requestId,
        summary: 'Device setup request approved',
      });
      return result;
    } catch (error) {
      this.rethrowDeviceSetupError(error);
      throw error;
    }
  }

  @Patch('device-setup/:requestId/confirm-payment')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Confirm payment for a device setup request',
    description: 'Records that the tenant has paid, confirmed manually by a platform admin: awaiting_payment → ready_for_installation. Idle while approval auto-approves payment.',
  })
  @ApiOkResponse({ type: SystemDeviceSetupRequestDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to confirm device request payments' })
  @ApiNotFoundResponse({ description: 'Device setup request not found' })
  @ApiBadRequestResponse({ description: 'The request is not awaiting payment' })
  async confirmSystemDeviceSetupPayment(
    @Param('requestId') requestId: string,
    @Body(BodyOrDataPipe) payload: ConfirmDeviceSetupPaymentDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.confirmSystemDeviceSetupPaymentUseCase.execute(accessToken, requestId, payload?.note);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.device_setup.payment_confirmed',
        entityType: 'device_setup_request',
        entityId: requestId,
        summary: 'Device setup request payment confirmed',
      });
      return result;
    } catch (error) {
      this.rethrowDeviceSetupError(error);
      throw error;
    }
  }

  @Patch('device-setup/:requestId/reject')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject device setup request with a reason' })
  @ApiOkResponse({ type: SystemDeviceSetupRequestDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to reject device setup requests' })
  @ApiNotFoundResponse({ description: 'Device setup request not found' })
  @ApiBadRequestResponse({ description: 'Missing rejection reason' })
  async rejectSystemDeviceSetupRequest(
    @Param('requestId') requestId: string,
    @Body(BodyOrDataPipe) payload: RejectDeviceSetupRequestDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.rejectSystemDeviceSetupRequestUseCase.execute(accessToken, requestId, payload.reason);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.device_setup.rejected',
        entityType: 'device_setup_request',
        entityId: requestId,
        summary: 'Device setup request rejected',
        metadata: { reason: payload.reason },
      });
      return result;
    } catch (error) {
      this.rethrowDeviceSetupError(error);
      throw error;
    }
  }

  @Get('tickets/summary')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get support ticket counts summary' })
  @ApiOkResponse({ type: SystemSupportDashboardResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async getSystemSupportTicketsSummary(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemSupportDashboardUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('tickets/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export support tickets as CSV' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, enum: TICKET_CATEGORIES })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV export', schema: { type: 'string', format: 'binary' } })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async exportSystemSupportTickets(
    @Headers('authorization') authorization: string | undefined,
    @Query('status') status: string | undefined,
    @Query('category') category: string | undefined,
    @Query('search') search: string | undefined,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const exported = await this.exportSystemSupportTicketsUseCase.execute(accessToken, { status, category, search });
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
      return new StreamableFile(Buffer.from(exported.csv, 'utf8'));
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('tickets')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all support tickets' })
  @ApiOkResponse({ type: SystemSupportTicketsListResponse })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, enum: TICKET_CATEGORIES })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'reporterType', required: false, enum: SUPPORT_TICKET_REPORTER_TYPES, description: 'installer is the installation desk' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async listSystemSupportTickets(
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('reporterType') reporterType?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    const reporter = reporterTypeFilter(reporterType);
    try {
      return await this.listSystemSupportTicketsUseCase.execute(accessToken, { status, category, search, reporterType: reporter });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('tickets/:ticketId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get support ticket detail' })
  @ApiOkResponse({ type: SystemSupportTicketDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  @ApiNotFoundResponse({ description: 'Ticket not found' })
  async getSystemSupportTicket(
    @Param('ticketId') ticketId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemSupportTicketUseCase.execute(accessToken, ticketId);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof NotFoundException) throw error;
      throw error;
    }
  }

  @Patch('tickets/:ticketId/assign')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assign a ticket to platform support staff, or clear the assignment' })
  @ApiOkResponse({ type: SystemSupportTicketActionResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system mutator' })
  @ApiNotFoundResponse({ description: 'Ticket not found' })
  @ApiBadRequestResponse({ description: 'Assignee is not platform support staff' })
  async assignSystemSupportTicket(
    @Param('ticketId') ticketId: string,
    @Body() body: AssignTicketDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.assignSystemSupportTicketUseCase.execute(
        accessToken,
        ticketId,
        body.assigneeId ?? null,
      );
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.support_ticket.assigned',
        entityType: 'support_ticket',
        entityId: ticketId,
        summary: body.assigneeId ? 'Ticket assigned' : 'Ticket assignment cleared',
        metadata: { assignedTo: body.assigneeId ?? null },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof AssigneeNotSupportStaffError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Patch('tickets/:ticketId/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update ticket status' })
  @ApiOkResponse({ type: SystemSupportTicketActionResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system mutator' })
  @ApiNotFoundResponse({ description: 'Ticket not found' })
  @ApiBadRequestResponse({ description: 'Invalid status' })
  async updateSystemSupportTicketStatus(
    @Param('ticketId') ticketId: string,
    @Body() body: UpdateTicketStatusDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.updateSystemSupportTicketStatusUseCase.execute(accessToken, ticketId, body.status);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.support_ticket.status_updated',
        entityType: 'support_ticket',
        entityId: ticketId,
        summary: `Ticket status updated to ${body.status}`,
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof NotFoundException) throw error;
      if (error instanceof InvalidTicketStatusError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Patch('tickets/:ticketId/escalate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Escalate support ticket' })
  @ApiOkResponse({ type: SystemSupportTicketActionResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system mutator' })
  @ApiNotFoundResponse({ description: 'Ticket not found' })
  @ApiBadRequestResponse({ description: 'Invalid escalation target' })
  async escalateSystemSupportTicket(
    @Param('ticketId') ticketId: string,
    @Body() body: EscalateTicketDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.escalateSystemSupportTicketUseCase.execute(
        accessToken,
        ticketId,
        body.escalatedTo,
        body.referenceId,
        body.notes,
      );
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.support_ticket.escalated',
        entityType: 'support_ticket',
        entityId: ticketId,
        summary: `Ticket escalated to ${body.escalatedTo}`,
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof NotFoundException) throw error;
      if (error instanceof InvalidEscalationTargetError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Get('tickets/:ticketId/messages')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List ticket messages (includes internal notes)' })
  @ApiOkResponse({ type: SystemSupportMessagesResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  @ApiNotFoundResponse({ description: 'Ticket not found' })
  async listSystemSupportTicketMessages(
    @Param('ticketId') ticketId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listSystemSupportTicketMessagesUseCase.execute(accessToken, ticketId);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof NotFoundException) throw error;
      throw error;
    }
  }

  @Post('tickets/:ticketId/messages')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send message or internal note on ticket' })
  @ApiCreatedResponse({ type: SystemSupportMessageActionResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system mutator' })
  @ApiNotFoundResponse({ description: 'Ticket not found' })
  async sendSystemSupportMessage(
    @Param('ticketId') ticketId: string,
    @Body() body: SendSupportMessageDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.sendSystemSupportMessageUseCase.execute(
        accessToken,
        ticketId,
        body.message,
        body.isInternal ?? false,
      );
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: body.isInternal ? 'system.support_ticket.internal_note_added' : 'system.support_ticket.message_sent',
        entityType: 'support_ticket',
        entityId: ticketId,
        summary: body.isInternal ? 'Internal note added to ticket' : 'Message sent on ticket',
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof NotFoundException) throw error;
      throw error;
    }
  }

  /** One mapping for every device-setup route, so the same fault reads the same everywhere. */
  private rethrowDeviceSetupError(error: unknown): void {
    this.rethrowInvalidAccessToken(error);
    if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
    if (error instanceof DeviceSetupRequestNotFoundError || error instanceof InstallerNotFoundError) {
      throw new NotFoundException(error.message);
    }
    if (error instanceof DeviceSetupRequestUnpricedError || error instanceof InstallerStateError) {
      throw new ConflictException(error.message);
    }
    if (
      error instanceof DeviceSetupRequestAlreadyDecidedError
      || error instanceof DeviceSetupRejectionReasonRequiredError
      || error instanceof DeviceSetupRequestNotReadyError
      || error instanceof DeviceSetupRequestNotAwaitingPaymentError
    ) {
      throw new BadRequestException(error.message);
    }
  }
}
