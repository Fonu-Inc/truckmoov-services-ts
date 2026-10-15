import { Inject, Injectable } from '@nestjs/common';
import { ListSystemTenantsUseCase } from './list-system-tenants.use-case';
import type {
  SystemTenantFilters,
  SystemTenantRow,
} from './list-system-tenants.use-case';
import { escapeCsvValue } from '@shared/csv';

function formatFeatures(row: SystemTenantRow) {
  return [
    row.features.liveTracking ? 'live_tracking' : null,
    row.features.messaging ? 'messaging' : null,
    row.features.geofencing ? 'geofencing' : null,
    row.features.routeOptimization ? 'route_optimization' : null,
    row.features.advancedAnalytics ? 'advanced_analytics' : null,
    row.features.apiAccess ? 'api_access' : null,
  ]
    .filter((feature): feature is string => Boolean(feature))
    .join('|');
}

@Injectable()
export class ExportSystemTenantsUseCase {
  constructor(
    @Inject(ListSystemTenantsUseCase)
    private readonly listSystemTenantsUseCase: ListSystemTenantsUseCase,
  ) {}

  async execute(accessToken: string, filters: SystemTenantFilters) {
    const tenants = await this.listSystemTenantsUseCase.list(
      accessToken,
      filters,
    );
    const headers = [
      'tenantId',
      'name',
      'slug',
      'email',
      'billingEmail',
      'phone',
      'organizationType',
      'plan',
      'planCode',
      'status',
      'vehicleCount',
      'driverCount',
      'deviceCount',
      'simCount',
      'collectedThisMonthNgn',
      'kycStatus',
      'lastActiveAt',
      'createdAt',
      'hasPendingInvitation',
      'invitationAccepted',
      'enabledFeatures',
    ];

    const rows = tenants.map((tenant) => [
      tenant.id,
      tenant.name,
      tenant.slug,
      tenant.email,
      tenant.billingEmail,
      tenant.phone,
      tenant.organizationType,
      tenant.plan,
      tenant.planCode,
      tenant.status,
      tenant.vehicleCount,
      tenant.driverCount,
      tenant.deviceCount,
      tenant.simCount,
      tenant.collectedThisMonthNgn,
      tenant.businessInfo.verificationStatus,
      tenant.lastActiveAt,
      tenant.createdAt,
      String(tenant.invitationStatus.hasPendingInvitation),
      String(tenant.invitationStatus.invitationAccepted),
      formatFeatures(tenant),
    ]);

    const csv = [
      headers.map(escapeCsvValue).join(','),
      ...rows.map((row) => row.map(escapeCsvValue).join(',')),
    ].join('\n');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return {
      filename: `system-tenants-${timestamp}.csv`,
      csv,
    };
  }
}
