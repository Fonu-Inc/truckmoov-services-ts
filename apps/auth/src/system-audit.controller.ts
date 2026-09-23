import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import type { AuditLogQuery } from './activity-log.types';
import {
  GetAuditFilterOptionsUseCase,
  ListAuditLogUseCase,
  VerifyAuditChainsUseCase,
  type AuditLogRow,
} from './audit-log.use-cases';
import { BaseAuthController } from './base.controller';
import { ForbiddenError } from './contexts/auth/session';
import { Portals } from '@shared/access';

const EXPORT_LIMIT = 5000;

@ApiTags('System Audit')
@Portals('admin')
@Controller('system/audit-log')
export class SystemAuditController extends BaseAuthController {
  constructor(
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
    @Inject(ListAuditLogUseCase) private readonly listAuditLog: ListAuditLogUseCase,
    @Inject(GetAuditFilterOptionsUseCase) private readonly filterOptions: GetAuditFilterOptionsUseCase,
    @Inject(VerifyAuditChainsUseCase) private readonly verifyChains: VerifyAuditChainsUseCase,
  ) {
    super(activityLogService);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cross-tenant audit log',
    description:
      'The platform-wide audit trail, newest first. Every tenant, not only the system tenant.',
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'tenantId', required: false, type: String })
  @ApiQuery({ name: 'actor', required: false, type: String, description: 'Id, name or email' })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'resourceType', required: false, type: String })
  @ApiQuery({ name: 'source', required: false, type: String, description: 'The recording service' })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'Audit entries' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to view the platform audit log' })
  async list(@Query() query: Record<string, string>, @Headers('authorization') authorization?: string) {
    const accessToken = this.requireToken(authorization);
    try {
      return await this.listAuditLog.execute(accessToken, toFilters(query));
    } catch (error) {
      this.rethrowAuditError(error);
      throw error;
    }
  }

  @Get('filters')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Audit filter options',
    description: 'Tenants, actions, resource types and services present in the trail.',
  })
  @ApiOkResponse({ description: 'Filter options' })
  async filters(@Headers('authorization') authorization?: string) {
    const accessToken = this.requireToken(authorization);
    try {
      return await this.filterOptions.execute(accessToken);
    } catch (error) {
      this.rethrowAuditError(error);
      throw error;
    }
  }

  @Get('verify')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Verify the audit chains',
    description:
      'Recomputes every tenant hash chain and reports the first break in any of them. What makes "immutable" checkable rather than a label.',
  })
  @ApiOkResponse({ description: 'Chain verification result' })
  async verify(@Headers('authorization') authorization?: string) {
    const accessToken = this.requireToken(authorization);
    try {
      return await this.verifyChains.execute(accessToken);
    } catch (error) {
      this.rethrowAuditError(error);
      throw error;
    }
  }

  @Get('export')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Export the audit log as CSV',
    description: 'The same filters as the list, capped at 5000 rows.',
  })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV file' })
  async export(
    @Res({ passthrough: false }) res: any,
    @Query() query: Record<string, string>,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireToken(authorization);
    try {
      const rows = await this.listAuditLog.rows(accessToken, {
        ...toFilters(query),
        limit: EXPORT_LIMIT,
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=audit-log.csv');
      res.send(toCsv(rows));
    } catch (error) {
      this.rethrowAuditError(error);
      throw error;
    }
  }

  private requireToken(authorization?: string): string {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    return accessToken;
  }

  private rethrowAuditError(error: unknown): void {
    this.rethrowInvalidAccessToken(error);
    if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
  }
}

function toFilters(query: Record<string, string>): AuditLogQuery {
  return {
    search: query['search'],
    tenantId: query['tenantId'],
    actor: query['actor'],
    action: query['action'],
    entityType: query['resourceType'],
    service: query['source'],
    from: parseDate(query['from'], 'from'),
    to: parseDate(query['to'], 'to'),
    limit: parseLimit(query['limit']),
  };
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
  return Math.floor(parsed);
}

const AUDIT_CSV_COLUMNS = [
  'occurredAt',
  'actorName',
  'actorEmail',
  'actorId',
  'actorRole',
  'action',
  'resourceType',
  'resourceId',
  'tenantId',
  'tenantName',
  'ipAddress',
  'source',
  'summary',
] as const;

function toCsv(rows: AuditLogRow[]): string {
  const body = rows.map((row) =>
    AUDIT_CSV_COLUMNS.map((column) => escapeCsvValue(row[column])).join(','),
  );
  return [AUDIT_CSV_COLUMNS.join(','), ...body].join('\n');
}

// Summaries and names are arbitrary text. A spreadsheet reads a leading =, +,
// - or @ as a formula, so it is neutralised on the way out.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

function escapeCsvValue(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = FORMULA_LEAD.test(value) ? `'${value}` : value;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
