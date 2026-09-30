import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
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
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { ForbiddenError } from './contexts/auth/session';
import { ListSystemAuthEventsUseCase, ListSystemFailedLoginsUseCase } from './list-system-auth-events.use-case';
import {
  AutoBlockRuleNotFoundError,
  ListAutoBlockRulesUseCase,
  UpdateAutoBlockRuleUseCase,
} from './auto-block-rule.use-cases';
import { isAutoBlockRuleId } from './auto-block-rule.repository';
import { ListSecurityEventsUseCase } from './list-security-events.use-case';
import { GetSecurityOverviewUseCase } from './get-security-overview.use-case';
import { UpdateAutoBlockRuleDto } from './dto/security.dto';
import { Portals, OnResource } from '@shared/access';

@ApiTags('System Security')
@Portals('admin')
@OnResource('admin.security')
@Controller('system/security')
export class SystemSecurityController extends BaseAuthController {
  constructor(
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
    @Inject(GetSecurityOverviewUseCase) private readonly getSecurityOverviewUseCase: GetSecurityOverviewUseCase,
    @Inject(ListSystemAuthEventsUseCase) private readonly listSystemAuthEventsUseCase: ListSystemAuthEventsUseCase,
    @Inject(ListSystemFailedLoginsUseCase) private readonly listSystemFailedLoginsUseCase: ListSystemFailedLoginsUseCase,
    @Inject(ListAutoBlockRulesUseCase) private readonly listAutoBlockRulesUseCase: ListAutoBlockRulesUseCase,
    @Inject(UpdateAutoBlockRuleUseCase) private readonly updateAutoBlockRuleUseCase: UpdateAutoBlockRuleUseCase,
    @Inject(ListSecurityEventsUseCase) private readonly listSecurityEventsUseCase: ListSecurityEventsUseCase,
  ) {
    super(activityLogService);
  }

  @Get('overview')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Security overview counts' })
  @ApiOkResponse()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async getOverview(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSecurityOverviewUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('auth-events')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List authentication events' })
  @ApiQuery({ name: 'tenantId', required: false, type: String })
  @ApiQuery({ name: 'eventType', required: false, enum: ['login', 'logout', 'refresh'] })
  @ApiQuery({ name: 'status', required: false, enum: ['success', 'failed'] })
  @ApiQuery({ name: 'ipAddress', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiOkResponse()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async listAuthEvents(
    @Headers('authorization') authorization: string | undefined,
    @Query('tenantId') tenantId: string | undefined,
    @Query('eventType') eventType: string | undefined,
    @Query('status') status: string | undefined,
    @Query('ipAddress') ipAddress: string | undefined,
    @Query('search') search: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('offset') offset: string | undefined,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listSystemAuthEventsUseCase.execute(accessToken, {
        tenantId,
        eventType: eventType as never,
        status: status as never,
        ipAddress,
        search,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        limit: this.parseNumericQuery(limit),
        offset: this.parseNumericQuery(offset),
      });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('failed-logins')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List failed login attempts' })
  @ApiQuery({ name: 'ipAddress', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiOkResponse()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async listFailedLogins(
    @Headers('authorization') authorization: string | undefined,
    @Query('ipAddress') ipAddress: string | undefined,
    @Query('search') search: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('offset') offset: string | undefined,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listSystemFailedLoginsUseCase.execute(accessToken, {
        ipAddress,
        search,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        limit: this.parseNumericQuery(limit),
        offset: this.parseNumericQuery(offset),
      });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('auto-block-rules')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List auto-block rules' })
  @ApiOkResponse()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async listAutoBlockRules(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listAutoBlockRulesUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Patch('auto-block-rules/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an auto-block rule' })
  @ApiOkResponse()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system mutator' })
  async updateAutoBlockRule(
    @Param('id') id: string,
    @Body() body: UpdateAutoBlockRuleDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    if (!isAutoBlockRuleId(id)) throw new BadRequestException('Unknown auto-block rule');
    try {
      const result = await this.updateAutoBlockRuleUseCase.execute(accessToken, id, body);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.security.auto_block_rule_updated',
        entityType: 'auto_block_rule',
        entityId: id,
        summary: `Auto-block rule ${id} updated`,
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof AutoBlockRuleNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('events')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List security events' })
  @ApiQuery({ name: 'tenantId', required: false, type: String })
  @ApiQuery({ name: 'severity', required: false, enum: ['low', 'medium', 'high', 'critical'] })
  @ApiQuery({ name: 'eventType', required: false, type: String })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiOkResponse()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async listSecurityEvents(
    @Headers('authorization') authorization: string | undefined,
    @Query('tenantId') tenantId: string | undefined,
    @Query('severity') severity: string | undefined,
    @Query('eventType') eventType: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('offset') offset: string | undefined,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listSecurityEventsUseCase.execute(accessToken, {
        tenantId,
        severity: severity as never,
        eventType: eventType as never,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        limit: this.parseNumericQuery(limit),
        offset: this.parseNumericQuery(offset),
      });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }
}
