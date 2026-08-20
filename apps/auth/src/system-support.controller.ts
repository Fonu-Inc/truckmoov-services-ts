import {
  Res,
  ForbiddenException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  BadRequestException,
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
  ApiOperation,
  ApiQuery,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { AssignSystemDeviceSetupRequestUseCase } from './assign-system-device-setup-request.use-case';
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
import { RejectDeviceSetupRequestDto } from './dto/device-setup.dto';
import {
  TICKET_CATEGORIES,
  UpdateTicketStatusDto,
  EscalateTicketDto,
  SendSupportMessageDto,
} from './dto/support.dto';
import { InvalidEscalationTargetError, EscalateSystemSupportTicketUseCase } from './escalate-system-support-ticket.use-case';
import { ExportSystemDeviceSetupRequestsUseCase } from './export-system-device-setup-requests.use-case';
import { ExportSystemSupportTicketsUseCase } from './export-system-support-tickets.use-case';
import { DeviceSetupRequestNotFoundError, GetSystemDeviceSetupRequestUseCase } from './get-system-device-setup-request.use-case';
import { GetSystemSupportDashboardUseCase } from './get-system-support-dashboard.use-case';
import { GetSystemSupportTicketUseCase } from './get-system-support-ticket.use-case';
import { ListSystemDeviceSetupRequestsUseCase } from './list-system-device-setup-requests.use-case';
import { ListSystemEscalatedTicketsUseCase } from './list-system-escalated-tickets.use-case';
import { ListSystemSupportTicketMessagesUseCase } from './list-system-support-ticket-messages.use-case';
import { ListSystemSupportTicketsUseCase } from './list-system-support-tickets.use-case';
import { RejectSystemDeviceSetupRequestUseCase } from './reject-system-device-setup-request.use-case';
import { SendSystemSupportMessageUseCase } from './send-system-support-message.use-case';
import { InvalidTicketStatusError, UpdateSystemSupportTicketStatusUseCase } from './update-system-support-ticket-status.use-case';

@ApiTags('System Support')
@Controller('system/support')
export class SystemSupportController extends BaseAuthController {
  constructor(
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
    @Inject(GetSystemSupportDashboardUseCase) private readonly getSystemSupportDashboardUseCase: GetSystemSupportDashboardUseCase,
    @Inject(ListSystemSupportTicketsUseCase) private readonly listSystemSupportTicketsUseCase: ListSystemSupportTicketsUseCase,
    @Inject(GetSystemSupportTicketUseCase) private readonly getSystemSupportTicketUseCase: GetSystemSupportTicketUseCase,
    @Inject(UpdateSystemSupportTicketStatusUseCase) private readonly updateSystemSupportTicketStatusUseCase: UpdateSystemSupportTicketStatusUseCase,
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
  @ApiQuery({ name: 'status', required: false, enum: ['pending_review', 'in_progress', 'assigned', 'rejected'] })
  @ApiQuery({ name: 'search', required: false, type: String })
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
  @ApiQuery({ name: 'status', required: false, enum: ['pending_review', 'in_progress', 'assigned', 'rejected'] })
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
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof DeviceSetupRequestNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch('device-setup/:requestId/assign')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assign device setup request to current actor' })
  @ApiOkResponse({ type: SystemDeviceSetupRequestDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to assign device setup requests' })
  @ApiNotFoundResponse({ description: 'Device setup request not found' })
  async assignSystemDeviceSetupRequest(
    @Param('requestId') requestId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.assignSystemDeviceSetupRequestUseCase.execute(accessToken, requestId);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.device_setup.assigned',
        entityType: 'device_setup_request',
        entityId: requestId,
        summary: 'Device setup request assigned',
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof DeviceSetupRequestNotFoundError) throw new NotFoundException(error.message);
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
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof DeviceSetupRequestNotFoundError) throw new NotFoundException(error.message);
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
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async listSystemSupportTickets(
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listSystemSupportTicketsUseCase.execute(accessToken, { status, category, search });
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
}
