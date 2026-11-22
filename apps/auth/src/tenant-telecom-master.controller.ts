import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { OnResource, Portals } from '@shared/access';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController, rethrowActorError } from './base.controller';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { SubmitTelecomMasterDto, TenantTelecomMasterResponse } from './dto/telecom-master.dto';
import {
  TelecomMasterAlreadyRequestedError,
  TelecomMasterInvalidInputError,
  TelecomMasterNumberUnavailableError,
  TenantTelecomMasterUseCases,
} from './telecom-master.use-cases';

/** The enterprise account's Telecom Master number. Owner-operator accounts are refused. */
@ApiTags('Telecom Master')
@Portals('tenant')
@OnResource('tenant.organization')
@Controller('telecom-master')
export class TenantTelecomMasterController extends BaseAuthController {
  constructor(
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
    @Inject(TenantTelecomMasterUseCases)
    private readonly telecomMaster: TenantTelecomMasterUseCases,
  ) {
    super(activityLogService);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: "The account's Telecom Master",
    description: 'The newest request, or null when none has been made. Never a device SIM MSISDN.',
  })
  @ApiOkResponse({ type: TenantTelecomMasterResponse })
  @ApiForbiddenResponse({ description: 'Not an enterprise account' })
  async current(@Headers('authorization') authorization?: string) {
    const accessToken = this.requireToken(authorization);
    return this.run(() => this.telecomMaster.current(accessToken));
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Request a Telecom Master',
    description:
      'Register an existing MTN number (pending verification) or ask for a new one (allocation pending). Refused while a non-failed request exists.',
  })
  @ApiOkResponse({ type: TenantTelecomMasterResponse })
  @ApiForbiddenResponse({ description: 'Not an enterprise account' })
  @ApiConflictResponse({ description: 'A request already exists, or the number is unavailable' })
  async submit(
    @Body(BodyOrDataPipe) payload: SubmitTelecomMasterDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireToken(authorization);
    const result = await this.run(() => this.telecomMaster.submit(accessToken, payload));
    const request = result.data.request;
    await this.tryRecordActivity({
      tenantId: request.tenantId ?? '',
      service: 'auth',
      action: 'telecom_master.requested',
      entityType: 'telecom_master_request',
      entityId: request.id,
      summary: 'Telecom Master requested',
      metadata: { numberType: request.numberType, status: request.status },
    });
    return result;
  }

  private requireToken(authorization?: string): string {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    return accessToken;
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      rethrowActorError(error);
      if (
        error instanceof TelecomMasterAlreadyRequestedError
        || error instanceof TelecomMasterNumberUnavailableError
      ) {
        throw new ConflictException(error.message);
      }
      if (error instanceof TelecomMasterInvalidInputError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
