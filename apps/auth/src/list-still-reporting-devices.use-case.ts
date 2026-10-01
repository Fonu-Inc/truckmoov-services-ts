import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { getAuthOrm } from './contexts/auth/session/infrastructure/persistence/auth-orm';
import { ensureSystemActor } from './system-authz';
import { TrackingGateClient, type GateBlockedDevice } from './tracking-gate.client';
import { TENANT_SUSPENSION_REPOSITORY, type TenantSuspensionRepository } from './tenant-suspension.repository';

export type DeviceFacts = {
  id: string;
  imei: string;
  name: string | null;
  manufacturer: string;
  model: string;
  tenantId: string;
  suspendedAt: Date | null;
};

export type StillReportingDevice = {
  deviceId: string | null;
  imei: string;
  deviceName: string;
  tenantId: string;
  companyName: string;
  blockedReason: 'tenant' | 'device';
  suspendedAt: string | null;
  lastSeenAt: string;
  droppedToday: number;
  droppedTotal: number;
};

export type StillReportingResult = {
  gateReachable: boolean;
  countsSince: string | null;
  devices: StillReportingDevice[];
};

export type StillReportingInput = {
  blocked: GateBlockedDevice[];
  devicesByImei: Map<string, DeviceFacts>;
  tenantSuspendedAt: Map<string, Date>;
  tenantNames: Map<string, string>;
};

function deviceLabel(blocked: GateBlockedDevice, facts?: DeviceFacts): string {
  if (facts?.name?.trim()) return facts.name.trim();
  const model = [facts?.manufacturer, facts?.model].filter(Boolean).join(' ').trim();
  return model || blocked.imei;
}

function suspensionTime(blocked: GateBlockedDevice, input: StillReportingInput, tenantId: string, facts?: DeviceFacts) {
  const tenantTime = input.tenantSuspendedAt.get(tenantId) ?? null;
  if (blocked.blockedReason === 'tenant') return tenantTime;
  return facts?.suspendedAt ?? tenantTime;
}

/**
 * Keeps devices the gate saw after they were suspended. Without a known
 * suspension time the gate's own block is proof enough, so they stay in.
 */
export function selectStillReporting(input: StillReportingInput): StillReportingDevice[] {
  const rows: StillReportingDevice[] = [];
  for (const blocked of input.blocked) {
    const facts = input.devicesByImei.get(blocked.imei);
    const tenantId = blocked.tenantId || facts?.tenantId || '';
    const suspendedAt = suspensionTime(blocked, input, tenantId, facts);
    const seenAt = new Date(blocked.lastSeenAt);
    if (suspendedAt && !(seenAt.getTime() > suspendedAt.getTime())) continue;
    rows.push({
      deviceId: blocked.deviceId || facts?.id || null,
      imei: blocked.imei,
      deviceName: deviceLabel(blocked, facts),
      tenantId,
      companyName: input.tenantNames.get(tenantId) ?? 'Unknown company',
      blockedReason: blocked.blockedReason,
      suspendedAt: suspendedAt ? suspendedAt.toISOString() : null,
      lastSeenAt: seenAt.toISOString(),
      droppedToday: blocked.droppedToday,
      droppedTotal: blocked.droppedTotal,
    });
  }
  return rows.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

@Injectable()
export class ListStillReportingDevicesUseCase {
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(TrackingGateClient) private readonly gate: TrackingGateClient,
    @Inject(TENANT_SUSPENSION_REPOSITORY) private readonly suspensions: TenantSuspensionRepository,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view device inventory',
    });
    const report = await this.gate.blockedDevices();
    const result: StillReportingResult = report
      ? { gateReachable: true, countsSince: report.countsSince, devices: await this.join(report.devices) }
      : { gateReachable: false, countsSince: null, devices: [] };
    return { status: true, message: 'success', data: { ...result, generatedAt: new Date().toISOString() } };
  }

  private async join(blocked: GateBlockedDevice[]): Promise<StillReportingDevice[]> {
    if (blocked.length === 0) return [];
    const [devicesByImei, suspensions] = await Promise.all([
      this.loadDevices(blocked.map((entry) => entry.imei)),
      this.suspensions.findAll(),
    ]);
    const tenantIds = new Set(blocked.map((entry) => entry.tenantId).filter(Boolean));
    devicesByImei.forEach((facts) => tenantIds.add(facts.tenantId));
    return selectStillReporting({
      blocked,
      devicesByImei,
      tenantSuspendedAt: new Map(suspensions.map((row) => [row.tenantId, row.suspendedAt])),
      tenantNames: await this.loadTenantNames([...tenantIds]),
    });
  }

  private async loadDevices(imeis: string[]): Promise<Map<string, DeviceFacts>> {
    const found = new Map<string, DeviceFacts>();
    const ids = imeis.filter(Boolean);
    if (this.config.persistence.backend === 'in-memory' || ids.length === 0) return found;
    const connection = (await getAuthOrm(this.config.db)).em.getConnection();
    const rows = await connection.execute<Array<Record<string, unknown>>>(
      `select id, imei, name, manufacturer, model, tenant_id, suspended_at
         from fleet_devices where imei in (${ids.map(() => '?').join(', ')})`,
      ids,
    );
    for (const row of rows) {
      const imei = String(row.imei ?? '');
      found.set(imei, {
        id: String(row.id ?? ''),
        imei,
        name: row.name ? String(row.name) : null,
        manufacturer: String(row.manufacturer ?? ''),
        model: String(row.model ?? ''),
        tenantId: String(row.tenant_id ?? ''),
        suspendedAt: row.suspended_at ? new Date(row.suspended_at as string) : null,
      });
    }
    return found;
  }

  private async loadTenantNames(tenantIds: string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    if (this.config.persistence.backend === 'in-memory' || tenantIds.length === 0) return names;
    const connection = (await getAuthOrm(this.config.db)).em.getConnection();
    const rows = await connection.execute<Array<{ tenant_id?: string; organization_name?: string | null }>>(
      `select tenant_id, organization_name from (
         select tenant_id, branding->>'organizationName' as organization_name from auth_organization_settings
         union
         select tenant_id, company->>'companyName' as organization_name from system_tenant_onboardings
       ) names where tenant_id in (${tenantIds.map(() => '?').join(', ')})`,
      tenantIds,
    );
    for (const row of rows) {
      const name = row.organization_name?.toString().trim();
      if (row.tenant_id && name && !names.has(row.tenant_id)) names.set(row.tenant_id, name);
    }
    return names;
  }
}
