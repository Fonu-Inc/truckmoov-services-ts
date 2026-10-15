import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { normalizeCsvHeader, splitCsvLine, stripFormulaGuard } from '@shared/csv';
import {
  TOKEN_SERVICE,
  USER_REPOSITORY,
  ForbiddenError,
} from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { DuplicateSimIccidError, SIM_REPOSITORY, type SimRepository } from './sim.repository';

export class InvalidCsvError extends Error {}

@Injectable()
export class ImportSimsCsvUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(SIM_REPOSITORY) private readonly simRepository: SimRepository,
  ) {}

  async execute(accessToken: string, csvBuffer: Buffer) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.userRepository,
    );
    if (actor.tenantId === 'system') {
      throw new ForbiddenError('System actors cannot import SIMs');
    }

    const rows = this.parseCsv(csvBuffer);
    const now = new Date();
    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      if (!row.iccid) continue;
      if (await this.saveRow(row, actor.tenantId, now)) imported++;
      else skipped++;
    }

    return {
      status: true,
      message: 'success',
      data: { imported, skipped },
    };
  }

  private async saveRow(
    row: { iccid: string; msisdn: string; carrier: string },
    tenantId: string,
    now: Date,
  ): Promise<boolean> {
    try {
    await this.simRepository.save({
      id: randomUUID(),
      iccid: row.iccid,
      imsi: null,
      msisdn: row.msisdn ?? null,
      carrier: row.carrier ?? '',
      plan: 'iot_basic',
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
      dataLimitMb: 0,
      smsUsage: 0,
      smsLimit: 0,
      monthlyCostNgn: 0,
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
    });
      return true;
    } catch (error) {
      if (error instanceof DuplicateSimIccidError) return false;
      throw error;
    }
  }

  private parseCsv(
    buf: Buffer,
  ): Array<{ iccid: string; msisdn: string; carrier: string }> {
    const lines = buf
      .toString('utf-8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) throw new InvalidCsvError('CSV file is empty or has no data rows');

    const headers = splitCsvLine(lines[0]).map(normalizeCsvHeader);
    const iccidIdx = headers.indexOf('iccid');
    const msisdnIdx = headers.indexOf('msisdn');
    const carrierIdx = headers.indexOf('carrier');

    if (iccidIdx === -1) throw new InvalidCsvError('CSV missing required column: iccid');

    return lines.slice(1).map((line) => {
      const cells = splitCsvLine(line).map((c) => stripFormulaGuard(c.trim()));
      return {
        iccid: cells[iccidIdx] ?? '',
        msisdn: msisdnIdx >= 0 ? (cells[msisdnIdx] ?? '') : '',
        carrier: carrierIdx >= 0 ? (cells[carrierIdx] ?? '') : '',
      };
    });
  }
}
