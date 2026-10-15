import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Patch,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { escapeCsvValue } from '@shared/csv';
import { ActivityLogService } from './activity-log.service';
import {
  GetAiGovernanceUseCase,
  GetAiUsageUseCase,
  InvalidAiSettingsError,
  ListAiRequestsUseCase,
  UpdateAiGovernanceUseCase,
} from './ai-governance.use-cases';
import { BaseAuthController } from './base.controller';
import { ForbiddenError } from './contexts/auth/session';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { UpdateAiGovernanceDto } from './dto/ai-governance.dto';
import { Portals, OnResource } from '@shared/access';

@ApiTags('System AI')
@Portals('admin')
@OnResource('admin.ai')
@Controller('system/ai')
export class SystemAiController extends BaseAuthController {
  constructor(
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
    @Inject(GetAiGovernanceUseCase) private readonly getAiGovernance: GetAiGovernanceUseCase,
    @Inject(UpdateAiGovernanceUseCase) private readonly updateAiGovernance: UpdateAiGovernanceUseCase,
    @Inject(GetAiUsageUseCase) private readonly getAiUsage: GetAiUsageUseCase,
    @Inject(ListAiRequestsUseCase) private readonly listAiRequests: ListAiRequestsUseCase,
  ) {
    super(activityLogService);
  }

  @Get('governance')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'AI providers, guardrails and data protection',
    description: 'Everything behind the Providers and Guardrails tabs, plus the master switch.',
  })
  @ApiOkResponse({ description: 'AI governance settings' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to view AI settings' })
  async governance(@Headers('authorization') authorization?: string) {
    const accessToken = this.requireToken(authorization);
    try {
      return await this.getAiGovernance.execute(accessToken);
    } catch (error) {
      this.rethrowAiError(error);
      throw error;
    }
  }

  @Patch('governance')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update AI governance',
    description:
      'Partial update. Providers are patched by key, so sending one provider leaves the others untouched.',
  })
  @ApiOkResponse({ description: 'The updated settings' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to change AI settings' })
  @ApiBadRequestResponse({ description: 'An unknown provider, tool, or an out-of-range limit' })
  async updateGovernance(
    @Body(BodyOrDataPipe) payload: UpdateAiGovernanceDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireToken(authorization);
    try {
      const result = await this.updateAiGovernance.execute({ accessToken, ...payload });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.ai.settings_updated',
        entityType: 'ai_governance',
        entityId: 'system',
        summary: 'AI settings updated',
        metadata: {
          matchingEnabled: payload.matchingEnabled,
          providersPatched: payload.providers?.map((provider) => provider.provider) ?? [],
          rateLimitsChanged: Boolean(payload.rateLimits),
          dataProtectionChanged: Boolean(payload.dataProtection),
        },
      });
      return result;
    } catch (error) {
      this.rethrowAiError(error);
      throw error;
    }
  }

  @Get('usage')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Platform AI usage',
    description: 'Totals, usage by provider and usage by tenant for the Usage tab.',
  })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiOkResponse({ description: 'Usage aggregates' })
  async usage(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireToken(authorization);
    try {
      return await this.getAiUsage.execute(accessToken, parseDate(from, 'from'), parseDate(to, 'to'));
    } catch (error) {
      this.rethrowAiError(error);
      throw error;
    }
  }

  @Get('requests')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Recent AI requests',
    description: 'The request table under the Usage tab. Newest first.',
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'provider', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['all', 'success', 'failed'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'Recent requests' })
  async requests(
    @Query('search') search?: string,
    @Query('provider') provider?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireToken(authorization);
    try {
      return await this.listAiRequests.execute(accessToken, {
        search,
        provider,
        status,
        limit: parseLimit(limit),
      });
    } catch (error) {
      this.rethrowAiError(error);
      throw error;
    }
  }

  @Get('requests/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export recent AI requests as CSV' })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV file' })
  async exportRequests(
    @Res({ passthrough: false }) res: any,
    @Query('search') search?: string,
    @Query('provider') provider?: string,
    @Query('status') status?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireToken(authorization);
    try {
      const result = await this.listAiRequests.execute(accessToken, {
        search,
        provider,
        status,
        limit: 1000,
      });

      const headers = [
        'createdAt',
        'tenantId',
        'provider',
        'model',
        'feature',
        'tokens',
        'latencyMs',
        'succeeded',
        'errorMessage',
      ];
      const rows = result.data.items.map((item) =>
        [
          item.createdAt,
          item.tenantId,
          item.provider,
          item.model,
          item.feature,
          item.tokens,
          item.latencyMs,
          String(item.succeeded),
          item.errorMessage ?? '',
        ]
          .map(escapeCsvValue)
          .join(','),
      );

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=ai-requests.csv');
      res.send([headers.join(','), ...rows].join('\n'));
    } catch (error) {
      this.rethrowAiError(error);
      throw error;
    }
  }

  private requireToken(authorization?: string): string {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    return accessToken;
  }

  private rethrowAiError(error: unknown): void {
    this.rethrowInvalidAccessToken(error);
    if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
    if (error instanceof InvalidAiSettingsError) throw new BadRequestException(error.message);
  }
}

function parseDate(raw: string | undefined, field: string): Date | undefined {
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${field} must be a valid date`);
  }
  return parsed;
}

function parseLimit(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.min(Math.floor(parsed), 1000);
}
