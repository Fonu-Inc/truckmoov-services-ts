import { Inject, Injectable } from '@nestjs/common';
import {
  DEVICE_MODEL_CATALOG_REPOSITORY,
  type DeviceModelCatalogRepository,
} from './device-model-catalog.repository';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import {
  DEFAULT_TENANT_FEATURES,
  SIM_CARRIERS,
  SIM_DATA_PACKAGES,
  TENANT_BILLING_CYCLES,
  TENANT_ORGANIZATION_TYPES,
} from './tenant-onboarding.repository';
import { getSupportedOnboardingDeviceCatalog } from './system-device-catalog.validation';
import { ensureSystemActor } from './system-authz';

@Injectable()
export class GetSystemTenantOnboardingReferenceDataUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(DEVICE_MODEL_CATALOG_REPOSITORY)
    private readonly deviceModelCatalogRepository: DeviceModelCatalogRepository,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(
      accessToken,
      this.tokenService,
      this.userRepository,
      {
        forbiddenMessage:
          'You are not permitted to view tenant onboarding reference data',
      },
    );

    const deviceCatalog = await getSupportedOnboardingDeviceCatalog(
      this.deviceModelCatalogRepository,
    );

    return {
      status: true,
      message: 'success',
      data: {
        organizationTypes: [...TENANT_ORGANIZATION_TYPES],
        billingCycles: [...TENANT_BILLING_CYCLES],
        deviceManufacturers: deviceCatalog.manufacturers,
        deviceCatalog: deviceCatalog.catalog,
        simCarriers: [...SIM_CARRIERS],
        simDataPackages: [...SIM_DATA_PACKAGES],
        tenantStatuses: ['active', 'pending', 'suspended', 'inactive'],
        tenantPlans: ['starter', 'professional', 'enterprise'],
        featureDefaults: { ...DEFAULT_TENANT_FEATURES },
        featureOptions: [
          {
            key: 'liveTracking',
            label: 'Live Tracking',
            description: 'Real-time GPS tracking',
            defaultEnabled: true,
          },
          {
            key: 'geofencing',
            label: 'Geofencing',
            description: 'Zone alerts and monitoring',
            defaultEnabled: false,
          },
          {
            key: 'routeOptimization',
            label: 'Route Optimization',
            description: 'AI-powered route planning',
            defaultEnabled: false,
          },
          {
            key: 'messaging',
            label: 'Messaging',
            description: 'WhatsApp and SMS integration',
            defaultEnabled: true,
          },
          {
            key: 'advancedAnalytics',
            label: 'Advanced Analytics',
            description: 'Reports and insights',
            defaultEnabled: false,
          },
          {
            key: 'apiAccess',
            label: 'API Access',
            description: 'REST API integration',
            defaultEnabled: false,
          },
        ],
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
