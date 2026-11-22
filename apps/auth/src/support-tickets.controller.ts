import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Res,
  UnauthorizedException,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { AddMyTicketAttachmentUseCase } from './add-my-ticket-attachment.use-case';
import { CreateSupportTicketUseCase, InvalidTicketFieldError } from './create-support-ticket.use-case';
import { GetMySupportTicketUseCase } from './get-my-support-ticket.use-case';
import {
  GetMySupportSummaryUseCase,
  GetSupportOptionsUseCase,
} from './my-support.use-cases';
import {
  ExportMySupportTicketsUseCase,
  PreviewTicketContextUseCase,
} from './my-support-export.use-cases';
import { ListMySupportTicketsUseCase } from './list-my-support-tickets.use-case';
import {
  CloseMySupportTicketUseCase,
  ReopenMySupportTicketUseCase,
  ReplyToMySupportTicketUseCase,
  TicketActionNotAllowedError,
} from './support-ticket-lifecycle.use-cases';
import {
  TicketAttachmentRejectedByScannerError,
  TicketAttachmentTooLargeError,
  TicketAttachmentTypeNotAllowedError,
  MAX_TICKET_ATTACHMENT_BYTES,
} from './support-ticket-attachment.errors';
import { StorageQuotaExceededError } from './storage-usage.repository';
import { CreateSupportTicketDto, ReopenTicketDto, ReplyToTicketDto, SubmitTicketCsatDto } from './dto/support.dto';
import { SupportTicketAttachmentLinkResponse, SupportTicketCsatResponse } from './dto/auth.schema';
import { GetMyTicketAttachmentLinkUseCase } from './get-my-ticket-attachment-link.use-case';
import { MyTicketCsatUseCases } from './my-support-ticket-csat.use-cases';
import { TicketCsatAlreadySubmittedError } from './support-ticket-csat.repository';
import { Portals, OnResource } from '@shared/access';
import { numeric } from './installation-http';

/** Up to 5 files per attach call — the requirements name a per-file cap, not a count, so this is a sane bound rather than a stated one. */
const MAX_ATTACHMENTS_PER_CALL = 5;

@ApiTags('Support Tickets')
@Portals('tenant')
@OnResource('tenant.support')
@Controller('support-tickets')
export class SupportTicketsController extends BaseAuthController {
  constructor(
    protected readonly activityLogService: ActivityLogService,
    @Inject(CreateSupportTicketUseCase) private readonly createTicket: CreateSupportTicketUseCase,
    @Inject(ListMySupportTicketsUseCase) private readonly listTickets: ListMySupportTicketsUseCase,
    @Inject(GetMySupportTicketUseCase) private readonly getTicket: GetMySupportTicketUseCase,
    @Inject(ReplyToMySupportTicketUseCase) private readonly replyToTicket: ReplyToMySupportTicketUseCase,
    @Inject(CloseMySupportTicketUseCase) private readonly closeTicket: CloseMySupportTicketUseCase,
    @Inject(ReopenMySupportTicketUseCase) private readonly reopenTicket: ReopenMySupportTicketUseCase,
    @Inject(AddMyTicketAttachmentUseCase) private readonly addAttachment: AddMyTicketAttachmentUseCase,
    @Inject(GetMySupportSummaryUseCase) private readonly getMySupportSummaryUseCase: GetMySupportSummaryUseCase,
    @Inject(GetSupportOptionsUseCase) private readonly getSupportOptionsUseCase: GetSupportOptionsUseCase,
    @Inject(PreviewTicketContextUseCase) private readonly previewTicketContextUseCase: PreviewTicketContextUseCase,
    @Inject(ExportMySupportTicketsUseCase) private readonly exportMySupportTicketsUseCase: ExportMySupportTicketsUseCase,
    @Inject(GetMyTicketAttachmentLinkUseCase) private readonly attachmentLink: GetMyTicketAttachmentLinkUseCase,
    @Inject(MyTicketCsatUseCases) private readonly csat: MyTicketCsatUseCases,
  ) {
    super(activityLogService);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'My tickets', description: 'The caller tenant’s own tickets only.' })
  @ApiQuery({ name: 'status', required: false, description: 'One status or a comma-separated list' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'createdBy', required: false, enum: ['me'] })
  @ApiQuery({ name: 'channel', required: false, description: 'Matches channel, or otherChannel case-insensitively (e.g. "live chat")' })
  @ApiQuery({ name: 'page', required: false, description: 'Omit page and limit to get up to 500 tickets' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max 100' })
  async myTickets(
    @Headers('authorization') authorization?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('priority') priority?: string,
    @Query('search') search?: string,
    @Query('createdBy') createdBy?: string,
    @Query('channel') channel?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const accessToken = this.requireToken(authorization);
    if (createdBy && createdBy !== 'me') throw new BadRequestException('createdBy only accepts "me"');
    try {
      return await this.listTickets.execute(
        accessToken,
        { status, category, priority, search, createdBy, channel },
        { page: numeric(page), limit: numeric(limit) },
      );
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      throw error;
    }
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Raise a ticket' })
  async raiseTicket(
    @Body(BodyOrDataPipe) payload: CreateSupportTicketDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireToken(authorization);
    try {
      const result = await this.createTicket.execute({ accessToken, ...payload });
      return { status: true, message: 'Ticket raised', data: result.ticket };
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof InvalidTicketFieldError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Get('summary')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'My ticket counters',
    description: 'The five cards above the list, counted from this tenant only.',
  })
  @ApiOkResponse({ description: 'Ticket counters' })
  async summary(@Headers('authorization') authorization?: string) {
    const accessToken = this.requireToken(authorization);
    return this.runSupport(() => this.getMySupportSummaryUseCase.execute(accessToken));
  }

  @Get('options')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Form options',
    description:
      'Categories, channels, priorities and context types for the Log a Ticket form and the Report Issue wizard.',
  })
  @ApiOkResponse({ description: 'Dropdown options' })
  async options(@Headers('authorization') authorization?: string) {
    const accessToken = this.requireToken(authorization);
    return this.runSupport(() => this.getSupportOptionsUseCase.execute(accessToken));
  }

  @Get('context/:contextType/:contextId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Preview the context a ticket would attach',
    description:
      'What the wizard shows under "Context auto-attached". Read from the record itself, so the preview is the same snapshot the ticket will carry. A device may be named by its id or IMEI, a vehicle by its id or registration (no spaces); the snapshot carries the resolved deviceId or vehicleId.',
  })
  @ApiOkResponse({ description: 'The record snapshot, or null when it cannot be read' })
  async context(
    @Param('contextType') contextType: string,
    @Param('contextId') contextId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireToken(authorization);
    return this.runSupport(() =>
      this.previewTicketContextUseCase.execute(accessToken, contextType, contextId),
    );
  }

  @Get('export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export my tickets as CSV' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV file' })
  async export(
    @Res({ passthrough: false }) res: any,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireToken(authorization);
    const csv = await this.runSupport(() =>
      this.exportMySupportTicketsUseCase.execute(accessToken, { status, search }),
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=my-support-tickets.csv');
    res.send(csv);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'One ticket, its conversation and attachments' })
  async getOne(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const accessToken = this.requireToken(authorization);
    try {
      return await this.getTicket.execute(accessToken, id);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      throw error;
    }
  }

  @Post(':id/reply')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Reply to a ticket',
    description: 'A reply while a ticket is waiting_on_tenant returns it to in_progress automatically.',
  })
  async reply(
    @Param('id') id: string,
    @Body(BodyOrDataPipe) payload: ReplyToTicketDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireToken(authorization);
    try {
      const result = await this.replyToTicket.execute({ accessToken, ticketId: id, message: payload.message });
      return { status: true, message: 'Reply sent', data: result };
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof TicketActionNotAllowedError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Post(':id/close')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Close a resolved ticket' })
  async close(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const accessToken = this.requireToken(authorization);
    try {
      const result = await this.closeTicket.execute({ accessToken, ticketId: id });
      return { status: true, message: 'Ticket closed', data: result.ticket };
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof TicketActionNotAllowedError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Post(':id/reopen')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reopen a resolved ticket the problem persists on' })
  async reopen(
    @Param('id') id: string,
    @Body(BodyOrDataPipe) payload: ReopenTicketDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireToken(authorization);
    try {
      const result = await this.reopenTicket.execute({ accessToken, ticketId: id, reason: payload.reason });
      return { status: true, message: 'Ticket reopened', data: result.ticket };
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof TicketActionNotAllowedError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Post(':id/attachments')
  @UseInterceptors(
    FilesInterceptor('files', MAX_ATTACHMENTS_PER_CALL, {
      limits: { fileSize: MAX_TICKET_ATTACHMENT_BYTES, files: MAX_ATTACHMENTS_PER_CALL },
    }),
  )
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } },
    },
  })
  @ApiOperation({
    summary: 'Attach files to a ticket, or to one of your own replies on it',
    description: '10 MB per file. Images, PDF, DOC, DOCX, TXT, CSV, XLS, XLSX.',
  })
  @ApiQuery({ name: 'messageId', required: false, description: 'Attach to a specific reply rather than the ticket itself.' })
  async attach(
    @Param('id') id: string,
    @UploadedFiles()
    files: Array<{ originalname: string; mimetype: string; buffer: Buffer }>,
    @Headers('authorization') authorization?: string,
    @Query('messageId') messageId?: string,
  ) {
    const accessToken = this.requireToken(authorization);
    if (!files?.length) throw new BadRequestException('At least one file is required');

    try {
      const attachments = await this.addAttachment.execute({
        accessToken,
        ticketId: id,
        messageId,
        files: files.map((f) => ({ filename: f.originalname, contentType: f.mimetype, buffer: f.buffer })),
      });
      return { status: true, message: 'Attached', data: attachments };
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (
        error instanceof TicketAttachmentTooLargeError ||
        error instanceof TicketAttachmentTypeNotAllowedError ||
        error instanceof TicketAttachmentRejectedByScannerError
      ) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof StorageQuotaExceededError) {
        throw new HttpException(error.message, HttpStatus.PAYLOAD_TOO_LARGE);
      }
      throw error;
    }
  }

  @Get(':id/attachments/:attachmentId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'A short-lived download link for one attachment on a ticket of this account' })
  @ApiOkResponse({ type: SupportTicketAttachmentLinkResponse })
  async attachmentDownload(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Headers('authorization') authorization?: string,
  ): Promise<SupportTicketAttachmentLinkResponse> {
    const accessToken = this.requireToken(authorization);
    const data = await this.runSupport(() => this.attachmentLink.execute(accessToken, id, attachmentId));
    return { status: true, message: 'success', data };
  }

  @Get(':id/csat')
  @ApiBearerAuth()
  @ApiOperation({ summary: "The ticket's satisfaction rating, or null when nobody has rated it" })
  @ApiOkResponse({ type: SupportTicketCsatResponse })
  async getCsat(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ): Promise<SupportTicketCsatResponse> {
    const accessToken = this.requireToken(authorization);
    const data = await this.runSupport(() => this.csat.get(accessToken, id));
    return { status: true, message: 'success', data };
  }

  @Post(':id/csat')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Rate a resolved or closed ticket',
    description: 'One rating per ticket for the whole account. 400 before the ticket is resolved, 409 once rated.',
  })
  @ApiOkResponse({ type: SupportTicketCsatResponse })
  async submitCsat(
    @Param('id') id: string,
    @Body(BodyOrDataPipe) payload: SubmitTicketCsatDto,
    @Headers('authorization') authorization?: string,
  ): Promise<SupportTicketCsatResponse> {
    const accessToken = this.requireToken(authorization);
    try {
      const data = await this.csat.submit({ accessToken, ticketId: id, ...payload });
      return { status: true, message: 'Thanks for your feedback', data };
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof TicketActionNotAllowedError) throw new BadRequestException(error.message);
      if (error instanceof TicketCsatAlreadySubmittedError) throw new ConflictException(error.message);
      throw error;
    }
  }

  private async runSupport<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      throw error;
    }
  }

  private requireToken(authorization?: string): string {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    return accessToken;
  }
}
