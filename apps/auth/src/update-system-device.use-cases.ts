import { Inject, Injectable, Logger } from '@nestjs/common';
import { ManageInstallationOrdersUseCases } from './contexts/installation';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { FleetFactsService } from './fleet-facts.service';
import { ForbiddenError } from './contexts/auth/session';
import { TEST_TELEMETRY_DISABLED_MESSAGE, testTelemetryEnabled } from '@shared/devices';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import {
  mergeStockChunk,
  parseStockCsv,
  splitIntoChunks,
  STOCK_IMPORT_CHUNK_SIZE,
  MAX_REPORTED_STOCK_REJECTIONS,
  type StockImportTotals,
} from './system-device-stock-csv';

export class SystemDeviceWriteRefusedError extends Error {
  constructor(
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'SystemDeviceWriteRefusedError';
  }
}

/** Corrects a device record from the platform inventory. */
@Injectable()
export class UpdateSystemDeviceUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(FleetFactsService) private readonly fleet: FleetFactsService,
  ) {}

  async execute(
    accessToken: string,
    deviceId: string,
    patch: {
      manufacturer?: string;
      model?: string;
      firmwareVersion?: string;
      protocol?: string;
      lifecycleStatus?: string;
      status?: string;
    },
  ) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to edit devices',
    });

    const body = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    if (Object.keys(body).length === 0) {
      throw new SystemDeviceWriteRefusedError(400, 'Nothing to change');
    }

    const result = await this.fleet.updateDevice(deviceId, body);
    if (!result.ok) throw new SystemDeviceWriteRefusedError(result.status, result.message);

    return { status: true, message: 'Device updated', data: result.device };
  }
}

/** Records that stock devices now belong to a tenant. */
@Injectable()
export class AssignSystemDevicesUseCase {
  private readonly logger = new Logger(AssignSystemDevicesUseCase.name);

  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(FleetFactsService) private readonly fleet: FleetFactsService,
    @Inject(ManageInstallationOrdersUseCases) private readonly installations: ManageInstallationOrdersUseCases,
  ) {}

  async execute(
    accessToken: string,
    tenantId: string,
    deviceIds: string[],
    notes?: string,
  ) {
    const actor = await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to assign devices',
    });

    const result = await this.fleet.assignDevicesToTenant(tenantId, deviceIds, notes);
    if (!result.ok) throw new SystemDeviceWriteRefusedError(result.status, result.message);

    // The devices are the tenant's now whatever happens next, so a failed fit must not fail the assignment.
    const bound = await this.installations
      .autoBindUnits(tenantId, { id: actor.id, email: actor.email, role: actor.role }, deviceIds)
      .catch((error) => {
        this.logger.warn(`auto_bind_units_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`);
        return [];
      });

    return {
      status: true,
      message: 'Devices assigned',
      data: { tenantId, updated: result.updated, bound },
    };
  }
}

export type PartialStockImportError = Error & { partialTotals?: StockImportTotals };

/** Loads platform-held stock from a CSV, in chunks, and reports what landed. */
@Injectable()
export class ImportSystemDeviceStockUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(FleetFactsService) private readonly fleet: FleetFactsService,
  ) {}

  async execute(accessToken: string, csv: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to import device stock',
    });

    const { rows, problems } = parseStockCsv(csv);
    const totals: StockImportTotals = {
      total: rows.length + problems.length,
      created: 0,
      skippedExisting: 0,
      rejected: problems.slice(0, MAX_REPORTED_STOCK_REJECTIONS),
      rejectedTotal: problems.length,
    };
    if (rows.length === 0) {
      throw new SystemDeviceWriteRefusedError(400, 'The CSV has no importable device rows');
    }

    try {
      for (const chunkRows of splitIntoChunks(rows, STOCK_IMPORT_CHUNK_SIZE)) {
        const result = await this.fleet.importStockDevices(
          chunkRows.map(({ imei, manufacturer, model, name }) => ({ imei, manufacturer, model, name })),
        );
        // Earlier chunks are already stored and a rerun skips them, so stop at the first refusal.
        if (!result.ok) throw new SystemDeviceWriteRefusedError(result.status, result.message);
        mergeStockChunk(totals, chunkRows, result);
      }
    } catch (error) {
      // Lets the caller audit what earlier chunks already stored.
      if (error instanceof Error) (error as PartialStockImportError).partialTotals = totals;
      throw error;
    }

    return {
      status: true,
      message: `${totals.created} device(s) added to platform stock, ${totals.skippedExisting} already existed, ${totals.rejectedTotal} rejected`,
      data: totals,
    };
  }
}

/** Dev-only: has fleet publish a location fix for a device so the real verification path runs. */
@Injectable()
export class SendTestTelemetryUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(FleetFactsService) private readonly fleet: FleetFactsService,
  ) {}

  async execute(accessToken: string, input: { imei: string; latitude?: number; longitude?: number }) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      allowedRoles: SYSTEM_MUTATOR_ROLES,
      forbiddenMessage: 'You are not permitted to send test telemetry',
    });
    if (!testTelemetryEnabled()) throw new ForbiddenError(TEST_TELEMETRY_DISABLED_MESSAGE);

    const result = await this.fleet.sendTestTelemetry(input);
    if (!result.ok) throw new SystemDeviceWriteRefusedError(result.status, result.message);

    return { status: true, message: 'Test telemetry published', data: result.result };
  }
}
