import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { AddMyTicketAttachmentUseCase } from './add-my-ticket-attachment.use-case';
import { CreateSupportTicketUseCase, InvalidTicketFieldError } from './create-support-ticket.use-case';
import { GetMySupportTicketUseCase } from './get-my-support-ticket.use-case';
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
import { CreateSupportTicketDto, ReopenTicketDto, ReplyToTicketDto } from './dto/support.dto';

/** Up to 5 files per attach call — the requirements name a per-file cap, not a count, so this is a sane bound rather than a stated one. */
const MAX_ATTACHMENTS_PER_CALL = 5;

@ApiTags('Support Tickets')
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
  ) {
    super(activityLogService);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'My tickets', description: 'The caller tenant’s own tickets only.' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'search', required: false })
  async myTickets(
    @Headers('authorization') authorization?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('priority') priority?: string,
    @Query('search') search?: string,
  ) {
    const accessToken = this.requireToken(authorization);
    try {
      return await this.listTickets.execute(accessToken, { status, category, priority, search });
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

  private requireToken(authorization?: string): string {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    return accessToken;
  }
}
