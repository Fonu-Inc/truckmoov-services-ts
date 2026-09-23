import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Put,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SecretCipherNotConfiguredError } from '@shared/crypto';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { ForbiddenError } from './contexts/auth/session';
import { DeleteMailCredentialsUseCase } from './delete-mail-credentials.use-case';
import { SaveMailCredentialsDto } from './dto/mail-credentials.dto';
import { GetMailCredentialsUseCase } from './get-mail-credentials.use-case';
import {
  SaveMailCredentialsUseCase,
  UnsafeMailHostError,
  UnsupportedMailPortError,
} from './save-mail-credentials.use-case';
import { Portals, OnResource } from '@shared/access';

/**
 * The tenant's own mailbox, which this platform operates on their behalf.
 *
 * Write-only for the passwords: they go in on a PUT and never come back out.
 * A GET returns the masked preview so a screen can show which credential is
 * configured without the value leaving the server.
 */
@ApiTags('Mailbox')
@Portals('tenant')
@OnResource('tenant.mailbox')
@Controller('mailbox/credentials')
export class MailCredentialsController extends BaseAuthController {
  constructor(
    protected readonly activityLogService: ActivityLogService,
    @Inject(SaveMailCredentialsUseCase)
    private readonly saveUseCase: SaveMailCredentialsUseCase,
    @Inject(GetMailCredentialsUseCase)
    private readonly getUseCase: GetMailCredentialsUseCase,
    @Inject(DeleteMailCredentialsUseCase)
    private readonly deleteUseCase: DeleteMailCredentialsUseCase,
  ) {
    super(activityLogService);
  }

  @Put()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Connect or update the tenant mailbox',
    description:
      'Stores IMAP and SMTP credentials. Passwords are encrypted at rest and never returned.',
  })
  @ApiOkResponse({ description: 'Mailbox settings, with masked passwords' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller may not configure the mailbox' })
  async saveCredentials(
    @Body(BodyOrDataPipe) payload: SaveMailCredentialsDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireBearerToken(authorization);

    try {
      const data = await this.saveUseCase.execute({ accessToken, ...payload });
      await this.tryRecordActivity({
        tenantId: data.tenantId,
        service: 'auth',
        action: 'mailbox.connected',
        entityType: 'mailbox',
        entityId: data.tenantId,
        summary: 'Mailbox credentials updated',
        // The address identifies the mailbox. No part of the credential is
        // recorded here: an audit entry is not a place for a secret.
        metadata: { emailAddress: data.emailAddress, imapHost: data.imap.host },
      });
      return { status: true, message: 'success', data };
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current mailbox settings, with masked passwords' })
  @ApiOkResponse({ description: 'Mailbox settings, or null when not connected' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async getCredentials(@Headers('authorization') authorization?: string) {
    const accessToken = this.requireBearerToken(authorization);

    try {
      return { status: true, message: 'success', data: await this.getUseCase.execute(accessToken) };
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  @Delete()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disconnect the tenant mailbox' })
  @ApiOkResponse({ description: 'Mailbox disconnected' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller may not configure the mailbox' })
  async deleteCredentials(@Headers('authorization') authorization?: string) {
    const accessToken = this.requireBearerToken(authorization);

    try {
      return { status: true, ...(await this.deleteUseCase.execute(accessToken)) };
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  private requireBearerToken(authorization?: string): string {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    return accessToken;
  }

  private toHttpError(error: unknown): unknown {
    if (error instanceof UnsafeMailHostError || error instanceof UnsupportedMailPortError) {
      return new BadRequestException(error.message);
    }
    if (error instanceof ForbiddenError) {
      return new ForbiddenException(error.message);
    }
    if (error instanceof SecretCipherNotConfiguredError) {
      // Surfaced rather than swallowed: storing the password unencrypted
      // because a key is missing is never the right fallback.
      return new BadRequestException(error.message);
    }
    this.rethrowInvalidAccessToken(error);
    return error;
  }
}
