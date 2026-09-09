import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Put,
  Param,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SecretCipherNotConfiguredError } from '@shared/crypto';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { UpdatePlatformIntegrationCredentialsDto } from './dto/platform-integration-credentials.dto';
import {
  IntegrationCredentialKeyError,
  IntegrationCredentialSecretError,
  UpdatePlatformIntegrationCredentialsUseCase,
} from './update-platform-integration-credentials.use-case';
import { PlatformIntegrationCredentialStorageError } from './platform-integration-credentials.repository';
import { ForbiddenError } from './contexts/auth/session';

@ApiTags('Platform Integrations')
@Controller('system/integrations')
export class PlatformIntegrationCredentialsController extends BaseAuthController {
  constructor(
    activityLogService: ActivityLogService,
    private readonly credentials: UpdatePlatformIntegrationCredentialsUseCase,
  ) {
    super(activityLogService);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List platform integration configuration without secrets' })
  @ApiOkResponse()
  async list(@Headers('authorization') authorization?: string) {
    const token = this.requireToken(authorization);
    try {
      return { status: true, message: 'success', data: await this.credentials.list(token) };
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  @Get(':serviceKey')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'One platform integration, without its secret',
    description:
      'Returns configured: false rather than 404 when the service has never been set up, because that is a state the settings page renders rather than a failed lookup.',
  })
  @ApiOkResponse()
  async findOne(
    @Headers('authorization') authorization: string | undefined,
    @Param('serviceKey') serviceKey: string,
  ) {
    const token = this.requireToken(authorization);
    try {
      return {
        status: true,
        message: 'success',
        data: await this.credentials.findOne(token, serviceKey),
      };
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  @Put(':serviceKey')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create or update a platform integration credential' })
  @ApiOkResponse()
  async update(
    @Headers('authorization') authorization: string | undefined,
    @Param('serviceKey') serviceKey: string,
    @Body(BodyOrDataPipe) payload: UpdatePlatformIntegrationCredentialsDto,
  ) {
    const token = this.requireToken(authorization);
    try {
      const data = await this.credentials.update({
        accessToken: token,
        serviceKey,
        category: payload.category,
        enabled: payload.enabled,
        secret: payload.secret,
        config: payload.config,
      });
      return { status: true, message: 'success', data };
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  private requireToken(authorization?: string): string {
    const token = this.extractBearerToken(authorization);
    if (!token) throw new UnauthorizedException('Missing authorization');
    return token;
  }

  private toHttpError(error: unknown): Error {
    this.rethrowInvalidAccessToken(error);
    if (error instanceof ForbiddenError) return new ForbiddenException(error.message);
    if (error instanceof IntegrationCredentialKeyError) return new BadRequestException(error.message);
    if (error instanceof SecretCipherNotConfiguredError) return new BadRequestException(error.message);
    if (error instanceof IntegrationCredentialSecretError) return new BadRequestException(error.message);
    if (error instanceof PlatformIntegrationCredentialStorageError) {
      return new ServiceUnavailableException('Integration credential storage is unavailable');
    }
    return error instanceof Error ? error : new Error('Unexpected integration credential failure');
  }
}
