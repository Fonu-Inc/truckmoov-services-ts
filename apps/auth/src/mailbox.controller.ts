import {
  BadRequestException,
  Body,
  Controller,
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
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { ActivityLogService } from './activity-log.service';
import { ListMailboxUseCase } from './contexts/mailbox/list-mailbox.use-case';
import {
  AttachmentNotFoundError,
  DownloadAttachmentUseCase,
} from './contexts/mailbox/download-attachment.use-case';
import {
  AttachmentsTooLargeError,
  MailboxNotConnectedError,
  ReplyTargetNotFoundError,
  SendMailUseCase,
} from './contexts/mailbox/send-mail.use-case';
import { SendMailDto } from './dto/send-mail.dto';
import { UpdateMessageFlagsDto } from './dto/update-message-flags.dto';
import {
  MessageNotFoundError,
  UpdateMessageFlagsUseCase,
} from './contexts/mailbox/update-message-flags.use-case';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { Portals } from '@shared/access';

@ApiTags('Mailbox')
@Portals('tenant')
@Controller('mailbox')
export class MailboxController extends BaseAuthController {
  constructor(
    protected readonly activityLogService: ActivityLogService,
    @Inject(ListMailboxUseCase) private readonly listUseCase: ListMailboxUseCase,
    @Inject(SendMailUseCase) private readonly sendUseCase: SendMailUseCase,
    @Inject(DownloadAttachmentUseCase)
    private readonly downloadAttachmentUseCase: DownloadAttachmentUseCase,
    @Inject(UpdateMessageFlagsUseCase)
    private readonly updateMessageFlagsUseCase: UpdateMessageFlagsUseCase,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
  ) {
    super(activityLogService);
  }

  @Get('threads')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Conversation threads, newest first' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiOkResponse({ description: 'Threads for the caller\'s organisation' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async listThreads(
    @Headers('authorization') authorization?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const accessToken = this.requireBearerToken(authorization);
    const page = await this.listUseCase.listThreads(
      accessToken,
      this.parseNumericQuery(limit) ?? 25,
      this.parseNumericQuery(offset) ?? 0,
    );
    return { status: true, message: 'success', data: page };
  }

  @Get('threads/since')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Threads changed after a cursor',
    description:
      'The recovery path for a client that was disconnected. The push is at-most-once, so a client reconnecting asks from its last cursor and receives whatever it missed.',
  })
  @ApiQuery({ name: 'cursor', required: true, type: String, description: 'ISO timestamp of the newest thread the client already has.' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'Threads changed since the cursor, oldest first' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async listThreadsSince(
    @Query('cursor') cursor: string,
    @Headers('authorization') authorization?: string,
    @Query('limit') limit?: string,
  ) {
    const accessToken = this.requireBearerToken(authorization);
    const page = await this.listUseCase.listThreadsSince(
      accessToken,
      cursor ?? new Date(0).toISOString(),
      this.parseNumericQuery(limit) ?? 50,
    );
    return { status: true, message: 'success', data: page };
  }

  @Get('threads/:threadId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Messages in one thread, oldest first' })
  @ApiOkResponse({ description: 'Messages in the thread' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async readThread(
    @Param('threadId') threadId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireBearerToken(authorization);
    const messages = await this.listUseCase.readThread(accessToken, threadId);
    if (messages.length === 0) throw new NotFoundException('Thread not found');
    return { status: true, message: 'success', data: messages };
  }

  @Get('messages/:messageId/attachments/:index')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'A short-lived link to one attachment',
    description:
      'Fetches the bytes from the tenant mail server on first request, then serves them from storage.',
  })
  @ApiOkResponse({ description: 'Presigned download link' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async downloadAttachment(
    @Param('messageId') messageId: string,
    @Param('index') index: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireBearerToken(authorization);

    try {
      const data = await this.downloadAttachmentUseCase.execute(
        accessToken,
        decodeURIComponent(messageId),
        Number.parseInt(index, 10),
      );
      return { status: true, message: 'success', data };
    } catch (error) {
      if (error instanceof AttachmentNotFoundError) throw new NotFoundException(error.message);
      this.rethrowInvalidAccessToken(error);
      throw error;
    }
  }

  @Post('send')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Send from the tenant mailbox',
    description:
      'Sends over the tenant SMTP server and files the same message to their Sent folder as one operation.',
  })
  @ApiOkResponse({ description: 'Send outcome' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async send(
    @Body(BodyOrDataPipe) payload: SendMailDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireBearerToken(authorization);
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);

    try {
      const result = await this.sendUseCase.execute({
        tenantId: actor.tenantId,
        to: payload.to.map(toMailAddress),
        cc: payload.cc?.map(toMailAddress),
        bcc: payload.bcc?.map(toMailAddress),
        subject: payload.subject,
        bodyText: payload.bodyText ?? null,
        bodyHtml: payload.bodyHtml ?? null,
        replyToThreadId: payload.replyToThreadId,
        attachments: (payload.attachments ?? []).map((attachment) => ({
          filename: attachment.filename,
          contentType: attachment.contentType,
          // Base64 in, bytes out. Anything undecodable becomes an empty buffer
          // rather than throwing, and the size check then sees its real length.
          content: Buffer.from(attachment.content, 'base64'),
        })),
      });

      await this.tryRecordActivity({
        tenantId: actor.tenantId,
        service: 'auth',
        action: 'mailbox.sent',
        entityType: 'mailbox',
        entityId: result.messageId,
        summary: 'Message sent from the tenant mailbox',
        // Recipients and subject only. The body is the tenant's correspondence,
        // not something an audit trail should copy.
        metadata: {
          to: payload.to.map((address) => address.address),
          subject: payload.subject,
          filedToSent: result.filedToSent,
          attachmentCount: payload.attachments?.length ?? 0,
        },
      });

      return { status: true, message: 'success', data: result };
    } catch (error) {
      if (error instanceof AttachmentsTooLargeError) throw new BadRequestException(error.message);
      if (error instanceof MailboxNotConnectedError) throw new NotFoundException(error.message);
      if (error instanceof ReplyTargetNotFoundError) throw new NotFoundException(error.message);
      this.rethrowInvalidAccessToken(error);
      throw error;
    }
  }

  @Patch('messages/:id/flags')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Star or label a message',
    description:
      'Writes to the tenant\'s real mailbox over IMAP first, then updates the local copy — so this view and the tenant\'s own mail client never disagree about what a message is flagged as.',
  })
  @ApiOkResponse({ description: 'Updated flag state' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async updateFlags(
    @Param('id') id: string,
    @Body(BodyOrDataPipe) payload: UpdateMessageFlagsDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireBearerToken(authorization);

    try {
      return await this.updateMessageFlagsUseCase.execute(accessToken, {
        messageId: id,
        starred: payload.starred,
        addLabels: payload.addLabels,
        removeLabels: payload.removeLabels,
      });
    } catch (error) {
      if (error instanceof MessageNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof MailboxNotConnectedError) throw new NotFoundException(error.message);
      this.rethrowInvalidAccessToken(error);
      throw error;
    }
  }

  private requireBearerToken(authorization?: string): string {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    return accessToken;
  }
}

/** A missing name is an absent name, not a distinct value. */
function toMailAddress(address: { address: string; name?: string | null }) {
  return { address: address.address, name: address.name ?? null };
}
