import {
  ConflictException,
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Portals, OnResource } from '@shared/access';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController, rethrowActorError } from './base.controller';
import {
  TelecomMasterDetailResponse,
  TelecomMasterListResponse,
} from './dto/telecom-master.dto';
import {
  GetTelecomMasterRequestUseCase,
  ListTelecomMasterRequestsUseCase,
  RetryTelecomMasterRequestUseCase,
  TelecomMasterRequestNotFoundError,
  TelecomMasterRetryNotAllowedError,
} from './telecom-master.use-cases';

@ApiTags('System Telecom Master')
@Portals('admin')
@OnResource('admin.tenants')
@Controller('system/telecom-master')
export class SystemTelecomMasterController extends BaseAuthController {
  constructor(
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
    @Inject(ListTelecomMasterRequestsUseCase)
    private readonly list: ListTelecomMasterRequestsUseCase,
    @Inject(GetTelecomMasterRequestUseCase)
    private readonly get: GetTelecomMasterRequestUseCase,
    @Inject(RetryTelecomMasterRequestUseCase)
    private readonly retry: RetryTelecomMasterRequestUseCase,
  ) {
    super(activityLogService);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List Telecom Master requests',
    description:
      'Existing MTN numbers and new Telecom Master allocation requests, newest first.',
  })
  @ApiOkResponse({ type: TelecomMasterListResponse })
  async findAll(@Headers('authorization') authorization?: string) {
    const accessToken = this.requireToken(authorization);
    return this.run(() => this.list.execute(accessToken));
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get one Telecom Master request',
    description: 'The request and its audit history.',
  })
  @ApiOkResponse({ type: TelecomMasterDetailResponse })
  async findOne(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireToken(authorization);
    return this.run(() => this.get.execute(accessToken, id));
  }

  @Post(':id/retry')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Retry a failed Telecom Master request',
    description:
      'Only verification_failed and allocation_failed requests can be retried. The request returns to the pending queue and an audit event is recorded.',
  })
  @ApiOkResponse({ type: TelecomMasterDetailResponse })
  @ApiConflictResponse({ description: 'The request is not in a failed state.' })
  async retryRequest(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireToken(authorization);
    return this.run(() => this.retry.execute(accessToken, id));
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
      if (error instanceof TelecomMasterRequestNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof TelecomMasterRetryNotAllowedError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }
}
