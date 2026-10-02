import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { DuplicateSimIccidError, SIM_REPOSITORY, type SimRepository, type StoredSim } from './sim.repository';

export class CsvParseError extends Error {}

type CsvRow = Record<string, string>;
type RowError = { row: number; field: string; message: string };

function parseCsvRows(csvBuffer: Buffer): { headers: string[]; rows: CsvRow[] } {
  const lines = csvBuffer
    .toString('utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 1) throw new CsvParseError('CSV file is empty');

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
  });

  return { headers, rows };
}

function buildSim(row: CsvRow, tenantId: string, now: Date): StoredSim {
  const dataLimitGb = row['data_limit_gb'] ? parseFloat(row['data_limit_gb']) : 0;
  const monthlyRental = row['monthly_rental_naira'] ? parseFloat(row['monthly_rental_naira']) : 0;
  return {
    id: randomUUID(),
    iccid: row['iccid'],
    imsi: row['imsi'] || null,
    msisdn: row['mobile_number'] || null,
    carrier: row['operator'] || '',
    plan: row['sim_type'] || 'iot_basic',
    status: 'registered',
    tenantId,
    deviceId: null,
    deviceName: null,
    deviceImei: null,
    deviceType: null,
    vehicleId: null,
    suspensionReason: null,
    notes: null,
    dataUsageMb: 0,
    dataLimitMb: dataLimitGb * 1024,
    smsUsage: 0,
    smsLimit: 0,
    monthlyCostNgn: monthlyRental,
    activationDate: null,
    expiryDate: null,
    lastActivity: null,
    signalStrength: null,
    networkType: null,
    roaming: false,
    fonuSimId: null,
    fonuStatus: null,
    createdAt: now,
    updatedAt: now,
  };
}

@Injectable()
export class ImportTenantSimsCsvUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepository: SimRepository,
  ) {}

  async execute(accessToken: string, csvBuffer: Buffer) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot import SIMs');

    const { rows } = parseCsvRows(csvBuffer);
    const now = new Date();
    const errors: RowError[] = [];
    const skipped: RowError[] = [];
    let importedCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      if (!row['iccid']) {
        errors.push({ row: rowNum, field: 'iccid', message: 'iccid is required' });
        continue;
      }

      try {
        await this.simRepository.save(buildSim(row, actor.tenantId, now));
        importedCount++;
      } catch (error) {
        if (!(error instanceof DuplicateSimIccidError)) throw error;
        skipped.push({ row: rowNum, field: 'iccid', message: 'Skipped: cannot be added' });
      }
    }

    return {
      status: true,
      message: 'success',
      data: {
        importedCount,
        skippedCount: skipped.length,
        failedCount: errors.length,
        errors: errors.length ? errors : undefined,
        skipped: skipped.length ? skipped : undefined,
      },
    };
  }
}
