import { Inject, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { AppConfigService } from '@shared/config';
import { type ServiceCaller, createServiceCaller } from '@shared/identity';

/**
 * Facts auth needs from fleet to make a decision.
 *
 * Fleet owns vehicles, so fleet counts them. Reading fleet's tables from here
 * would put the same number in two places and let them disagree, which is the
 * coupling this platform has been removing.
 */
/**
 * Identifiers the platform will put into a URL path.
 *
 * Every id below arrives from a request — a path parameter or a request body —
 * and is interpolated into a call carrying a cross-tenant platform-admin
 * token. Without this, `../../` in an id walks out of the intended route and
 * reaches any internal fleet endpoint with those privileges.
 *
 * Validation and encoding both, deliberately. Encoding alone would neutralise
 * traversal, but a value outside this shape is not an id we issued and there
 * is nothing useful to do with it but refuse.
 */
const SAFE_PATH_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Nest's unmatched-route fallback names the path it could not match, and this
 * service calls fleet on an internal URL the caller never sees. Forwarding that
 * message verbatim hands the service topology to anyone who sends a bad id.
 */
const ROUTE_FALLBACK = /^Cannot (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /i;

function isRouteFallback(raw: string | undefined): boolean {
  return !raw || ROUTE_FALLBACK.test(raw) || raw.includes('/fleet/internal');
}

function safeDownstreamMessage(raw: string | undefined, fallback: string): string {
  if (!raw || isRouteFallback(raw)) return fallback;
  return raw;
}

function isSafePathId(value: string): boolean {
  return SAFE_PATH_ID.test(value);
}

export type TenantExportTable = { columns: string[]; rows: Array<Array<string | number | boolean | null>> };

export type PlatformDeviceAction = 'suspend' | 'reinstate' | 'decommission' | 'update' | 'assign' | 'stock_import' | 'test_telemetry';
export type TenantHoldCounts = { devices: number; vehicles: number; shareLinks: number };
export type TenantHoldResult = ({ ok: true } & TenantHoldCounts) | { ok: false; message: string };

@Injectable()
export class FleetFactsService {
  private readonly logger = new Logger(FleetFactsService.name);

  private readonly caller: ServiceCaller;

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {
    this.caller = createServiceCaller(config, 'auth');
  }

  /**
   * Active vehicles a tenant holds right now.
   *
   * Returns null when fleet cannot be reached. The caller must treat that as
   * "unknown" and refuse to decide, rather than as zero: approving a promotion
   * on a count of zero would approve one that has no justification.
   */
  async activeVehicleCount(tenantId: string): Promise<number | null> {
    const headers = this.caller.headers('fleet', { tenantId, legacyRole: 'OWNER_OPERATOR' });
    if (!headers) return null;

    try {
      const response = await axios.get<{ data?: { activeVehicles?: number } }>(
        `${this.config.auth.fleetServiceUrl}/fleet/internal/vehicle-count`,
        {
          headers,
          timeout: 3000,
          validateStatus: () => true,
        },
      );

      if (response.status !== 200) return null;
      const count = response.data?.data?.activeVehicles;
      return typeof count === 'number' ? count : null;
    } catch (error) {
      this.logger.warn(
        `fleet_vehicle_count_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }

  /**
   * Suspends or reinstates a device fleet owns.
   *
   * The rule — releasing the vehicle, remembering where the device was —
   * belongs to fleet, so the platform asks rather than writing the columns
   * itself. A copy of that rule here would be a second definition of what
   * suspension means.
   */
  async actOnDevice(
    deviceId: string,
    action: PlatformDeviceAction,
    reason?: string | null,
  ): Promise<{ ok: true; device: Record<string, unknown> } | { ok: false; status: number; message: string }> {
    if (!isSafePathId(deviceId)) {
      return { ok: false, status: 404, message: 'Device not found' };
    }

    const headers = this.caller.headers('fleet', { legacyRole: 'PLATFORM_ADMIN' });
    if (!headers) {
      return { ok: false, status: 503, message: 'Device service is not configured' };
    }

    try {
      const response = await axios.post<{ data?: Record<string, unknown>; message?: string }>(
        `${this.config.auth.fleetServiceUrl}/fleet/internal/devices/${encodeURIComponent(deviceId)}/${encodeURIComponent(action)}`,
        action === 'suspend' ? { reason: reason ?? null } : {},
        {
          headers,
          timeout: 5000,
          validateStatus: () => true,
        },
      );

      if (response.status < 200 || response.status >= 300) {
        return this.deviceActionRefusal(deviceId, action, response.status, response.data?.message);
      }
      return { ok: true, device: response.data?.data ?? {} };
    } catch (error) {
      this.logger.warn(
        `fleet_device_${action}_failed:${deviceId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return { ok: false, status: 503, message: 'The device service could not be reached' };
    }
  }

  /** Corrects the descriptive fields of a device, whatever tenant holds it. */
  async updateDevice(
    deviceId: string,
    patch: Record<string, unknown>,
  ): Promise<{ ok: true; device: Record<string, unknown> } | { ok: false; status: number; message: string }> {
    if (!isSafePathId(deviceId)) {
      return { ok: false, status: 404, message: 'Device not found' };
    }

    const headers = this.caller.headers('fleet', { legacyRole: 'PLATFORM_ADMIN' });
    if (!headers) {
      return { ok: false, status: 503, message: 'Device service is not configured' };
    }

    try {
      const response = await axios.patch<{ data?: Record<string, unknown>; message?: string }>(
        `${this.config.auth.fleetServiceUrl}/fleet/internal/devices/${encodeURIComponent(deviceId)}`,
        patch,
        { headers, timeout: 5000, validateStatus: () => true },
      );

      if (response.status < 200 || response.status >= 300) {
        return this.deviceActionRefusal(deviceId, 'update', response.status, response.data?.message);
      }
      return { ok: true, device: response.data?.data ?? {} };
    } catch (error) {
      this.logger.warn(
        `fleet_device_update_failed:${deviceId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return { ok: false, status: 503, message: 'The device service could not be reached' };
    }
  }

  /** Moves stock devices to a tenant so they can be fitted from that tenant's fleet. */
  async assignDevicesToTenant(
    tenantId: string,
    deviceIds: string[],
    notes?: string,
  ): Promise<{ ok: true; updated: number } | { ok: false; status: number; message: string }> {
    if (!isSafePathId(tenantId) || deviceIds.some((id) => !isSafePathId(id))) {
      return { ok: false, status: 400, message: 'The tenant or device id is not valid' };
    }

    const headers = this.caller.headers('fleet', { legacyRole: 'PLATFORM_ADMIN' });
    if (!headers) {
      return { ok: false, status: 503, message: 'Device service is not configured' };
    }

    try {
      const response = await axios.post<{ data?: { updated?: number }; message?: string }>(
        `${this.config.auth.fleetServiceUrl}/fleet/internal/devices/assign`,
        { tenantId, deviceIds, notes },
        { headers, timeout: 10000, validateStatus: () => true },
      );

      if (response.status < 200 || response.status >= 300) {
        return this.deviceActionRefusal(deviceIds[0] ?? tenantId, 'assign', response.status, response.data?.message);
      }
      return { ok: true, updated: response.data?.data?.updated ?? deviceIds.length };
    } catch (error) {
      this.logger.warn(
        `fleet_device_assign_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return { ok: false, status: 503, message: 'The device service could not be reached' };
    }
  }

  /** Tops a tenant up to `target` devices from platform stock. Moves nothing the tenant already holds. */
  async allocateDevicesFromStock(
    tenantId: string,
    target: number,
    notes?: string,
  ): Promise<
    | { ok: true; deviceIds: string[]; held: number; shortfall: number }
    | { ok: false; status: number; message: string }
  > {
    if (!isSafePathId(tenantId) || !Number.isInteger(target) || target < 1) {
      return { ok: false, status: 400, message: 'The tenant or device count is not valid' };
    }

    const headers = this.caller.headers('fleet', { legacyRole: 'PLATFORM_ADMIN' });
    if (!headers) {
      return { ok: false, status: 503, message: 'Device service is not configured' };
    }

    try {
      const response = await axios.post<{
        data?: { deviceIds?: string[]; held?: number; shortfall?: number };
        message?: string;
      }>(
        `${this.config.auth.fleetServiceUrl}/fleet/internal/devices/allocate-from-stock`,
        { tenantId, target, notes },
        { headers, timeout: 30000, validateStatus: () => true },
      );

      if (response.status < 200 || response.status >= 300) {
        return this.deviceActionRefusal(tenantId, 'assign', response.status, response.data?.message);
      }
      const data = response.data?.data;
      return {
        ok: true,
        deviceIds: data?.deviceIds ?? [],
        held: data?.held ?? 0,
        shortfall: data?.shortfall ?? 0,
      };
    } catch (error) {
      this.logger.warn(
        `fleet_device_allocate_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return { ok: false, status: 503, message: 'The device service could not be reached' };
    }
  }

  /** Registers devices the platform holds itself. A row's `line` in a rejection is its 1-based position in `rows`. */
  async importStockDevices(
    rows: Array<{ imei: string; manufacturer: string; model: string; name?: string }>,
  ): Promise<
    | {
        ok: true;
        created: number;
        skippedExisting: number;
        rejected: Array<{ line: number; imei: string; reason: string }>;
        rejectedTotal: number;
      }
    | { ok: false; status: number; message: string }
  > {
    const headers = this.caller.headers('fleet', { legacyRole: 'PLATFORM_ADMIN' });
    if (!headers) {
      return { ok: false, status: 503, message: 'Device service is not configured' };
    }

    try {
      const response = await axios.post<{
        data?: {
          created?: number;
          skippedExisting?: number;
          rejected?: Array<{ line: number; imei: string; reason: string }>;
          rejectedTotal?: number;
        };
        message?: string;
      }>(
        `${this.config.auth.fleetServiceUrl}/fleet/internal/devices/stock/import`,
        { rows },
        { headers, timeout: 120000, maxBodyLength: Infinity, validateStatus: () => true },
      );

      if (response.status < 200 || response.status >= 300) {
        return this.deviceActionRefusal('stock', 'stock_import', response.status, response.data?.message);
      }
      const data = response.data?.data;
      return {
        ok: true,
        created: data?.created ?? 0,
        skippedExisting: data?.skippedExisting ?? 0,
        rejected: data?.rejected ?? [],
        rejectedTotal: data?.rejectedTotal ?? 0,
      };
    } catch (error) {
      this.logger.warn(`fleet_stock_import_failed:${error instanceof Error ? error.message : 'unknown'}`);
      return { ok: false, status: 503, message: 'The device service could not be reached' };
    }
  }

  /** Asks fleet to publish a test fix for a device, so the real telemetry listener runs on it. */
  async sendTestTelemetry(body: {
    imei: string;
    latitude?: number;
    longitude?: number;
  }): Promise<{ ok: true; result: Record<string, unknown> } | { ok: false; status: number; message: string }> {
    const headers = this.caller.headers('fleet', { legacyRole: 'PLATFORM_ADMIN' });
    if (!headers) {
      return { ok: false, status: 503, message: 'Device service is not configured' };
    }

    try {
      const response = await axios.post<{ data?: Record<string, unknown>; message?: string }>(
        `${this.config.auth.fleetServiceUrl}/fleet/internal/devices/test-telemetry`,
        body,
        { headers, timeout: 10000, validateStatus: () => true },
      );

      if (response.status < 200 || response.status >= 300) {
        return this.deviceActionRefusal('test-telemetry', 'test_telemetry', response.status, response.data?.message);
      }
      return { ok: true, result: response.data?.data ?? {} };
    } catch (error) {
      this.logger.warn(`fleet_test_telemetry_failed:${error instanceof Error ? error.message : 'unknown'}`);
      return { ok: false, status: 503, message: 'The device service could not be reached' };
    }
  }

  /**
   * A 404 naming no device is fleet missing the route, or refusing the caller
   * as one: the device service is at fault, not the device.
   */
  private deviceActionRefusal(
    deviceId: string,
    action: PlatformDeviceAction,
    status: number,
    raw: string | undefined,
  ): { ok: false; status: number; message: string } {
    if (status === 404 && isRouteFallback(raw)) {
      this.logger.warn(`fleet_device_${action}_route_missing:${deviceId}`);
      return { ok: false, status: 503, message: 'The device service could not complete the change' };
    }
    return { ok: false, status, message: safeDownstreamMessage(raw, 'The device service refused the change') };
  }

  /**
   * A tenant's vehicles, drivers or devices for the platform admin drawer.
   *
   * Fleet owns them, so fleet lists them. Returns null when fleet cannot be
   * reached, which the caller shows as unavailable rather than as an empty
   * fleet — those mean very different things on a review screen.
   */
  async tenantResource(
    tenantId: string,
    resource: 'vehicles' | 'drivers' | 'devices',
  ): Promise<{ total: number; items: Array<Record<string, unknown>> } | null> {
    if (!isSafePathId(tenantId)) return null;

    const headers = this.caller.headers('fleet', { legacyRole: 'PLATFORM_ADMIN' });
    if (!headers) return null;

    try {
      const response = await axios.get<{
        data?: { total?: number; items?: Array<Record<string, unknown>> };
      }>(
        `${this.config.auth.fleetServiceUrl}/fleet/internal/tenants/${encodeURIComponent(tenantId)}/${encodeURIComponent(resource)}`,
        {
        headers,
        timeout: 4000,
        validateStatus: () => true,
      });

      if (response.status !== 200) return null;
      return {
        total: response.data?.data?.total ?? 0,
        items: response.data?.data?.items ?? [],
      };
    } catch (error) {
      this.logger.warn(
        `fleet_tenant_${resource}_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }

  /**
   * The registration plate for each of a tenant's vehicle ids. Null when fleet cannot be
   * reached, so a screen shows no plate rather than a wrong one.
   */
  async vehicleLabels(tenantId: string, vehicleIds: string[]): Promise<Map<string, string> | null> {
    if (vehicleIds.length === 0) return new Map();
    if (!isSafePathId(tenantId)) return null;

    const headers = this.caller.headers('fleet', { legacyRole: 'PLATFORM_ADMIN' });
    if (!headers) return null;

    const labels = new Map<string, string>();
    try {
      // Ids travel in the query string, so ask in chunks that stay well under a URL limit.
      for (let i = 0; i < vehicleIds.length; i += 100) {
        const response = await axios.get<{ data?: { labels?: Record<string, string> } }>(
          `${this.config.auth.fleetServiceUrl}/fleet/internal/tenants/${encodeURIComponent(tenantId)}/vehicle-labels`,
          {
            headers,
            params: { ids: vehicleIds.slice(i, i + 100).join(',') },
            timeout: 4000,
            validateStatus: () => true,
          },
        );
        if (response.status !== 200) return null;
        for (const [id, label] of Object.entries(response.data?.data?.labels ?? {})) labels.set(id, label);
      }
      return labels;
    } catch (error) {
      this.logger.warn(
        `fleet_vehicle_labels_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }

  /**
   * Every row of a tenant's vehicles, drivers or devices, for the data export.
   * Null when fleet cannot be reached: an export must fail rather than ship a
   * file that is quietly missing a whole table.
   */
  async tenantExportTable(
    tenantId: string,
    scope: 'vehicles' | 'drivers' | 'devices',
  ): Promise<TenantExportTable | null> {
    if (!isSafePathId(tenantId)) return null;

    const headers = this.caller.headers('fleet', { legacyRole: 'PLATFORM_ADMIN' });
    if (!headers) return null;

    try {
      const response = await axios.get<{ data?: Partial<TenantExportTable> }>(
        `${this.config.auth.fleetServiceUrl}/fleet/internal/tenants/${encodeURIComponent(tenantId)}/export/${encodeURIComponent(scope)}`,
        { headers, timeout: 60000, validateStatus: () => true },
      );

      const data = response.data?.data;
      if (response.status !== 200 || !data?.columns || !data.rows) return null;
      return { columns: data.columns, rows: data.rows };
    } catch (error) {
      this.logger.warn(
        `fleet_tenant_export_${scope}_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }

  /**
   * The named devices, as long as this tenant holds them. A device held by
   * another tenant is left out, which is how the caller knows it is not theirs.
   *
   * Null when fleet cannot be reached.
   */
  async tenantDevicesByIds(
    tenantId: string,
    deviceIds: string[],
  ): Promise<Array<Record<string, unknown>> | null> {
    const ids = deviceIds.filter(isSafePathId);
    if (!isSafePathId(tenantId)) return null;
    if (ids.length === 0) return [];

    const headers = this.caller.headers('fleet', { legacyRole: 'PLATFORM_ADMIN' });
    if (!headers) return null;

    try {
      const response = await axios.get<{ data?: { items?: Array<Record<string, unknown>> } }>(
        `${this.config.auth.fleetServiceUrl}/fleet/internal/tenants/${encodeURIComponent(tenantId)}/devices`,
        { headers, params: { ids: ids.join(',') }, timeout: 4000, validateStatus: () => true },
      );

      if (response.status !== 200) return null;
      return response.data?.data?.items ?? [];
    } catch (error) {
      this.logger.warn(
        `fleet_tenant_devices_by_ids_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }

  /**
   * Ids of the devices a tenant holds that are on no vehicle, not on hold and still fittable.
   * Null when fleet cannot be reached.
   */
  async tenantUnfittedDeviceIds(tenantId: string): Promise<string[] | null> {
    if (!isSafePathId(tenantId)) return null;

    const headers = this.caller.headers('fleet', { legacyRole: 'PLATFORM_ADMIN' });
    if (!headers) return null;

    try {
      const response = await axios.get<{ data?: { items?: Array<{ deviceId?: string }> } }>(
        `${this.config.auth.fleetServiceUrl}/fleet/internal/tenants/${encodeURIComponent(tenantId)}/devices`,
        { headers, params: { unfitted: 'true' }, timeout: 4000, validateStatus: () => true },
      );

      if (response.status !== 200) return null;
      return (response.data?.data?.items ?? []).flatMap((item) => (item.deviceId ? [item.deviceId] : []));
    } catch (error) {
      this.logger.warn(
        `fleet_tenant_unfitted_devices_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }

  /**
   * Whether the named devices a tenant holds are reporting.
   *
   * Null when fleet could not be asked. The caller must not read that as every
   * device being silent: one closes an onboarding, the other stalls it.
   */
  async tenantConnectivity(tenantId: string, deviceIds: string[]): Promise<{
    total: number;
    reporting: number;
    items: Array<Record<string, unknown>>;
  } | null> {
    if (!isSafePathId(tenantId)) return null;

    const headers = this.caller.headers('fleet', { legacyRole: 'PLATFORM_ADMIN' });
    if (!headers) return null;

    try {
      const response = await axios.get<{
        data?: {
          total?: number;
          reporting?: number;
          items?: Array<Record<string, unknown>>;
        };
      }>(
        `${this.config.auth.fleetServiceUrl}/fleet/internal/tenants/${encodeURIComponent(tenantId)}/connectivity`,
        {
          headers,
          params: { deviceIds: deviceIds.filter(isSafePathId).join(',') },
          timeout: 8000,
          validateStatus: () => true,
        },
      );

      if (response.status !== 200) return null;
      return {
        total: response.data?.data?.total ?? 0,
        reporting: response.data?.data?.reporting ?? 0,
        items: response.data?.data?.items ?? [],
      };
    } catch (error) {
      this.logger.warn(
        `fleet_tenant_connectivity_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }

  /**
   * Opens verification on the named devices a tenant holds, skipping any
   * already waiting or verified. Null when fleet could not be asked.
   */
  async beginDeviceVerification(
    tenantId: string,
    deviceIds: string[],
  ): Promise<Array<Record<string, unknown>> | null> {
    const ids = deviceIds.filter(isSafePathId);
    if (!isSafePathId(tenantId)) return null;
    if (ids.length === 0) return [];

    const headers = this.caller.headers('fleet', { legacyRole: 'PLATFORM_ADMIN' });
    if (!headers) return null;

    try {
      const response = await axios.post<{ data?: { items?: Array<Record<string, unknown>> } }>(
        `${this.config.auth.fleetServiceUrl}/fleet/internal/tenants/${encodeURIComponent(tenantId)}/devices/verification`,
        { deviceIds: ids },
        { headers, timeout: 5000, validateStatus: () => true },
      );

      if (response.status < 200 || response.status >= 300) return null;
      return response.data?.data?.items ?? [];
    } catch (error) {
      this.logger.warn(
        `fleet_begin_verification_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }

  /**
   * Puts a fitted unit into the customer's fleet: the vehicle, created once per
   * registration, and the device assigned to it.
   */
  async handOverInstalledUnit(
    tenantId: string,
    unit: { deviceId: string; vehicle: Record<string, unknown> },
  ): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
    if (!isSafePathId(tenantId) || !isSafePathId(unit.deviceId)) {
      return { ok: false, status: 404, message: 'Device not found' };
    }

    const headers = this.caller.headers('fleet', { legacyRole: 'PLATFORM_ADMIN' });
    if (!headers) return { ok: false, status: 503, message: 'Device service is not configured' };

    try {
      const response = await axios.post<{ message?: string }>(
        `${this.config.auth.fleetServiceUrl}/fleet/internal/tenants/${encodeURIComponent(tenantId)}/installed-units`,
        unit,
        { headers, timeout: 8000, validateStatus: () => true },
      );

      if (response.status >= 200 && response.status < 300) return { ok: true };
      return {
        ok: false,
        status: response.status,
        message: safeDownstreamMessage(response.data?.message, 'The device service refused the installed unit'),
      };
    } catch (error) {
      this.logger.warn(
        `fleet_installed_unit_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return { ok: false, status: 503, message: 'The device service could not be reached' };
    }
  }

  /**
   * A snapshot of one record, for a support ticket's auto-attached context.
   *
   * Null when fleet cannot be reached or the record does not exist. The
   * caller treats that as "no context" and lets the ticket be raised anyway —
   * refusing to log a fault because the record could not be read is exactly
   * backwards when the fault may be that the record is unreachable.
   */
  async contextSnapshot(
    tenantId: string,
    resource: 'device' | 'vehicle',
    recordId: string,
  ): Promise<Record<string, unknown> | null> {
    // Refused rather than encoded away: an id outside this shape is not one we
    // issued, and the caller treats a null as "no context", which is correct.
    if (!isSafePathId(tenantId) || !isSafePathId(recordId)) return null;

    const headers = this.caller.headers('fleet', { legacyRole: 'PLATFORM_ADMIN' });
    if (!headers) return null;

    try {
      const response = await axios.get<{ data?: Record<string, unknown> }>(
        `${this.config.auth.fleetServiceUrl}/fleet/internal/tenants/${encodeURIComponent(tenantId)}/context/${encodeURIComponent(resource)}/${encodeURIComponent(recordId)}`,
        {
          headers,
          timeout: 4000,
          validateStatus: () => true,
        },
      );

      if (response.status !== 200) return null;
      return response.data?.data ?? null;
    } catch (error) {
      this.logger.warn(
        `fleet_context_snapshot_failed:${tenantId}:${resource}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }
  /**
   * Holds a tenant's devices, vehicles and share links without detaching
   * anything. Counts are what this call newly held, so a repeat reports zero.
   */
  async suspendTenantAssets(
    tenantId: string,
    body: { cause: 'manual' | 'non_payment'; reason: string; actor: { id: string; name: string } },
  ): Promise<TenantHoldResult> {
    return this.tenantHold(tenantId, 'suspend', body);
  }

  async reinstateTenantAssets(tenantId: string, cause: 'manual' | 'non_payment'): Promise<TenantHoldResult> {
    return this.tenantHold(tenantId, 'reinstate', { cause });
  }

  private async tenantHold(
    tenantId: string,
    action: 'suspend' | 'reinstate',
    body: Record<string, unknown>,
  ): Promise<TenantHoldResult> {
    if (!isSafePathId(tenantId)) return { ok: false, message: 'Tenant not found' };
    const headers = this.caller.headers('fleet', { legacyRole: 'PLATFORM_ADMIN' });
    if (!headers) return { ok: false, message: 'Device service is not configured' };

    try {
      const response = await axios.post<{ data?: Partial<TenantHoldCounts>; message?: string }>(
        `${this.config.auth.fleetServiceUrl}/fleet/internal/tenants/${encodeURIComponent(tenantId)}/${action}`,
        body,
        { headers, timeout: 60000, validateStatus: () => true },
      );
      if (response.status < 200 || response.status >= 300) {
        return {
          ok: false,
          message: safeDownstreamMessage(response.data?.message, 'The device service refused the change'),
        };
      }
      const data = response.data?.data ?? {};
      return {
        ok: true,
        devices: Number(data.devices ?? 0),
        vehicles: Number(data.vehicles ?? 0),
        shareLinks: Number(data.shareLinks ?? 0),
      };
    } catch (error) {
      this.logger.warn(
        `fleet_tenant_${action}_failed:${tenantId}:${error instanceof Error ? error.message : 'unknown'}`,
      );
      return { ok: false, message: 'The device service could not be reached' };
    }
  }

  /**
   * What a suspension would hold, per tenant, in one call. Null when fleet
   * could not be asked, which the caller shows as unknown rather than zero.
   */
  async previewTenantHold(tenantIds: string[]): Promise<Map<string, TenantHoldCounts> | null> {
    const ids = tenantIds.filter(isSafePathId);
    if (ids.length === 0) return new Map();
    const headers = this.caller.headers('fleet', { legacyRole: 'PLATFORM_ADMIN' });
    if (!headers) return null;

    try {
      const response = await axios.post<{
        data?: { items?: Array<{ tenantId: string } & Partial<TenantHoldCounts>> };
      }>(
        `${this.config.auth.fleetServiceUrl}/fleet/internal/tenants/suspension-preview`,
        { tenantIds: ids },
        { headers, timeout: 15000, validateStatus: () => true },
      );
      if (response.status < 200 || response.status >= 300) return null;
      const items = response.data?.data?.items ?? [];
      return new Map(
        items.map((item) => [
          item.tenantId,
          {
            devices: Number(item.devices ?? 0),
            vehicles: Number(item.vehicles ?? 0),
            shareLinks: Number(item.shareLinks ?? 0),
          },
        ]),
      );
    } catch (error) {
      this.logger.warn(`fleet_suspension_preview_failed:${error instanceof Error ? error.message : 'unknown'}`);
      return null;
    }
  }
}
