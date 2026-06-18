import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  DEVICE_MAPPING_FILE_REPOSITORY,
  type DeviceMappingFileRepository,
} from './device-mapping-file.repository';
import { ObjectStorageService } from '@shared/object-storage';

type RowError = { row: number; field: string; message: string };
type CsvRow = Record<string, string>;

function parseCsvRows(csvBuffer: Buffer): { headers: string[]; rows: CsvRow[] } {
  const lines = csvBuffer
    .toString('utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 1) throw new Error('CSV file is empty');

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
  });

  return { headers, rows };
}

const IMEI_REGEX = /^\d{15}$/;

@Injectable()
export class UploadDeviceMappingCsvUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(DEVICE_MAPPING_FILE_REPOSITORY)
    private readonly deviceMappingFileRepository: DeviceMappingFileRepository,
    private readonly objectStorageService: ObjectStorageService,
  ) {}

  async execute(accessToken: string, csvBuffer: Buffer) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId === 'system') throw new ForbiddenError('System actors cannot upload device mapping files');

    const { rows } = parseCsvRows(csvBuffer);
    const errors: RowError[] = [];
    const validRows: CsvRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      let rowValid = true;

      if (!row['device_name']) {
        errors.push({ row: rowNum, field: 'device_name', message: 'device_name is required' });
        rowValid = false;
      }
      if (!row['device_type']) {
        errors.push({ row: rowNum, field: 'device_type', message: 'device_type is required' });
        rowValid = false;
      }
      if (!row['imei']) {
        errors.push({ row: rowNum, field: 'imei', message: 'imei is required' });
        rowValid = false;
      } else if (!IMEI_REGEX.test(row['imei'])) {
        errors.push({ row: rowNum, field: 'imei', message: 'imei must be exactly 15 digits' });
        rowValid = false;
      }

      if (rowValid) validRows.push(row);
    }

    const fileId = randomUUID();
    const key = `auth/device-mapping/${fileId}.csv`;

    await this.objectStorageService.putObject({
      key,
      body: csvBuffer,
      contentType: 'text/csv',
      visibility: 'private',
    });

    const now = new Date();
    const record = {
      id: fileId,
      tenantId: actor.tenantId,
      fileKey: key,
      rowCount: validRows.length,
      errors: errors.length ? errors : null,
      createdAt: now,
    };

    await this.deviceMappingFileRepository.save(record);

    return {
      status: true,
      message: 'success',
      data: {
        fileId: record.id,
        rowCount: record.rowCount,
        ...(errors.length && { errors }),
      },
    };
  }
}
