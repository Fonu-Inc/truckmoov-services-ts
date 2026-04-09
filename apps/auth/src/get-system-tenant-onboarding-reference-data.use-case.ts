import { Inject, Injectable } from "@nestjs/common";
import { Role } from "@shared/rbac";
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from "./contexts/auth/session";
import { resolveActorUser } from "./contexts/auth/session/application/use-cases/support/resolve-actor-user";
import type { TokenService } from "./contexts/auth/session/domain/ports/token-service.port";
import type { UserRepository } from "./contexts/auth/session/domain/ports/user-repository.port";
import {
  DEFAULT_TENANT_FEATURES,
  DEVICE_MANUFACTURERS,
  SIM_CARRIERS,
  SIM_DATA_PACKAGES,
  TENANT_BILLING_CYCLES,
  TENANT_ORGANIZATION_TYPES,
} from "./tenant-onboarding.repository";

const SYSTEM_TENANT_ID = "system";
const SYSTEM_VIEWER_ROLES = new Set<string>([Role.SUPER_ADMIN, Role.SYSTEM_ADMIN]);

@Injectable()
export class GetSystemTenantOnboardingReferenceDataUseCase {
  constructor(
    @Inject(TOKEN_SERVICE)
    private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async execute(accessToken: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.userRepository);
    if (actor.tenantId !== SYSTEM_TENANT_ID || !SYSTEM_VIEWER_ROLES.has(actor.role)) {
      throw new ForbiddenError("You are not permitted to view tenant onboarding reference data");
    }

    return {
      status: true,
      message: "success",
      data: {
        organizationTypes: [...TENANT_ORGANIZATION_TYPES],
        billingCycles: [...TENANT_BILLING_CYCLES],
        deviceManufacturers: [...DEVICE_MANUFACTURERS],
        simCarriers: [...SIM_CARRIERS],
        simDataPackages: [...SIM_DATA_PACKAGES],
        tenantStatuses: ["active", "pending", "suspended", "inactive"],
        tenantPlans: ["starter", "professional", "enterprise"],
        featureDefaults: { ...DEFAULT_TENANT_FEATURES },
        featureOptions: [
          {
            key: "liveTracking",
            label: "Live Tracking",
            description: "Real-time GPS tracking",
            defaultEnabled: true,
          },
          {
            key: "geofencing",
            label: "Geofencing",
            description: "Zone alerts and monitoring",
            defaultEnabled: false,
          },
          {
            key: "routeOptimization",
            label: "Route Optimization",
            description: "AI-powered route planning",
            defaultEnabled: false,
          },
          {
            key: "messaging",
            label: "Messaging",
            description: "WhatsApp and SMS integration",
            defaultEnabled: true,
          },
          {
            key: "advancedAnalytics",
            label: "Advanced Analytics",
            description: "Reports and insights",
            defaultEnabled: false,
          },
          {
            key: "apiAccess",
            label: "API Access",
            description: "REST API integration",
            defaultEnabled: false,
          },
        ],
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
