import { Inject, Injectable } from '@nestjs/common';
import { ID_GENERATOR, TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { IdGenerator } from './contexts/auth/session/domain/ports/id-generator.port';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { SystemTenantNotFoundError } from './get-system-tenant.use-case';
import { ListSystemTenantsUseCase } from './list-system-tenants.use-case';
import { ensureSystemActor } from './system-authz';
import {
  EXPORT_RETENTION_DAYS,
  isTenantExportScope,
  TENANT_DATA_EXPORT_REPOSITORY,
  TENANT_EXPORT_SCOPES,
  type StoredTenantDataExport,
  type TenantDataExportRepository,
} from './tenant-data-export.repository';
import { TenantExportBuilder } from './tenant-export-builder';
import { TENANT_EXPORT_FILE_STORE, type TenantExportFileStore } from './tenant-export-file-store';

const LIST_LIMIT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

export class InvalidTenantExportError extends Error {}
export class TenantExportNotFoundError extends Error {
  constructor() {
    super('Export not found');
  }
}
export class TenantExportUnavailableError extends Error {}

export function toExportView(job: StoredTenantDataExport, now: Date) {
  const expired = job.expiresAt.getTime() <= now.getTime();
  return {
    id: job.id,
    tenantId: job.tenantId,
    scope: job.scope,
    status: job.status,
    rowCounts: job.rowCounts,
    fileName: job.fileName,
    fileBytes: job.fileBytes,
    error: job.error,
    requestedBy: job.requestedBy,
    requestedByName: job.requestedByName,
    createdAt: job.createdAt.toISOString(),
    expiresAt: job.expiresAt.toISOString(),
    expired,
    downloadable: job.status === 'ready' && !expired,
  };
}

const fileLabel = (tenantName: string, jobId: string) =>
  `${tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tenant'}-${jobId.slice(0, 8)}`;

@Injectable()
export class RequestTenantExportUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(ListSystemTenantsUseCase) private readonly tenants: ListSystemTenantsUseCase,
    @Inject(TENANT_DATA_EXPORT_REPOSITORY) private readonly exports: TenantDataExportRepository,
    @Inject(TENANT_EXPORT_FILE_STORE) private readonly files: TenantExportFileStore,
    @Inject(TenantExportBuilder) private readonly builder: TenantExportBuilder,
  ) {}

  async execute(accessToken: string, tenantId: string, scope: string) {
    const actor = await ensureSystemActor(accessToken, this.tokenService, this.users, {
      forbiddenMessage: 'Only system admins can export tenant data',
    });
    if (!isTenantExportScope(scope)) {
      throw new InvalidTenantExportError(`scope must be one of: ${TENANT_EXPORT_SCOPES.join(', ')}`);
    }
    const tenant = (await this.tenants.list(accessToken, {})).find((row) => row.id === tenantId);
    if (!tenant) throw new SystemTenantNotFoundError();

    const now = new Date();
    const job: StoredTenantDataExport = {
      id: this.ids.generate(),
      tenantId,
      scope,
      status: 'pending',
      rowCounts: {},
      fileKey: null,
      fileName: null,
      fileBytes: null,
      error: null,
      requestedBy: actor.id,
      requestedByName: actor.profile?.fullName ?? actor.email,
      createdAt: now,
      expiresAt: new Date(now.getTime() + EXPORT_RETENTION_DAYS * DAY_MS),
    };
    await this.exports.create(job);

    const finished = await this.generate(job, tenant.name);
    return {
      status: true,
      message: finished.status === 'ready' ? 'Export ready' : 'Export failed',
      data: toExportView(finished, new Date()),
    };
  }

  private async generate(job: StoredTenantDataExport, tenantName: string): Promise<StoredTenantDataExport> {
    try {
      const built = await this.builder.build(job.tenantId, job.scope, fileLabel(tenantName, job.id));
      const fileKey = `tenant-exports/${job.tenantId}/${job.id}/${built.fileName}`;
      await this.files.put(fileKey, built.body, built.contentType);
      const outcome = {
        status: 'ready' as const,
        rowCounts: built.rowCounts,
        fileKey,
        fileName: built.fileName,
        fileBytes: built.body.length,
      };
      await this.exports.finish(job.id, outcome);
      return { ...job, ...outcome };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The export could not be built';
      await this.exports.finish(job.id, { status: 'failed', error: message });
      return { ...job, status: 'failed', error: message };
    }
  }
}

@Injectable()
export class ListTenantExportsUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TENANT_DATA_EXPORT_REPOSITORY) private readonly exports: TenantDataExportRepository,
  ) {}

  async execute(accessToken: string, tenantId: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.users, {
      forbiddenMessage: 'You are not permitted to view tenant exports',
    });
    const now = new Date();
    const jobs = await this.exports.listForTenant(tenantId, LIST_LIMIT);
    return { status: true, message: 'success', data: { items: jobs.map((job) => toExportView(job, now)) } };
  }
}

@Injectable()
export class DownloadTenantExportUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TENANT_DATA_EXPORT_REPOSITORY) private readonly exports: TenantDataExportRepository,
    @Inject(TENANT_EXPORT_FILE_STORE) private readonly files: TenantExportFileStore,
  ) {}

  async execute(accessToken: string, tenantId: string, exportId: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.users, {
      forbiddenMessage: 'Only system admins can download tenant exports',
    });
    const job = await this.exports.findById(tenantId, exportId);
    if (!job) throw new TenantExportNotFoundError();
    if (job.status !== 'ready' || !job.fileKey || !job.fileName) {
      throw new TenantExportUnavailableError('This export has no file to download');
    }
    if (job.expiresAt.getTime() <= Date.now()) {
      throw new TenantExportUnavailableError('This export has expired. Request a new one.');
    }
    const body = await this.files.get(job.fileKey);
    if (!body) throw new TenantExportUnavailableError('The export file is no longer stored. Request a new one.');

    return {
      job,
      body,
      contentType: job.fileName.endsWith('.zip') ? 'application/zip' : 'text/csv; charset=utf-8',
    };
  }
}
