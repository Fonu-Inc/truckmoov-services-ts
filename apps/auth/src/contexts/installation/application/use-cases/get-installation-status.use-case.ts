import { Inject, Injectable } from '@nestjs/common';
import { TOKEN_SERVICE, USER_REPOSITORY } from '@auth/session';
import type { TokenService } from '@auth/session/domain/ports/token-service.port';
import type { UserRepository } from '@auth/session/domain/ports/user-repository.port';
import { resolveActorUser } from '@auth/session/application/use-cases/support/resolve-actor-user';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
} from '@auth/onboarding/domain/onboarding-application.repository';
import { stageProgress } from '@auth/onboarding/domain/onboarding-stage';
import {
  INSTALLATION_ORDER_REPOSITORY,
  type InstallationOrderRepository,
} from '@auth/installation/domain/installation-order.repository';
import {
  INSTALLER_REPOSITORY,
  type InstallerRepository,
} from '@auth/installation/domain/installer.repository';
import { INSTALLATION_SLOT_LABELS } from '@auth/installation/domain/installation-order';
import {
  INSTALLER_PHOTO_STORAGE,
  type InstallerPhotoStorage,
} from '@auth/installation/domain/ports/installer-photo-storage.port';

@Injectable()
export class GetInstallationStatusUseCase {
  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(INSTALLATION_ORDER_REPOSITORY)
    private readonly orders: InstallationOrderRepository,
    @Inject(INSTALLER_REPOSITORY)
    private readonly installers: InstallerRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(INSTALLER_PHOTO_STORAGE) private readonly photos: InstallerPhotoStorage,
  ) {}

  /** What the customer sees on the Get Started screen after logging in. */
  async execute(accessToken: string) {
    const actor = await resolveActorUser(
      accessToken,
      this.tokenService,
      this.users,
    );

    const order = await this.orders.findByTenantId(actor.tenantId);
    if (!order) {
      return {
        status: true,
        message: 'success',
        data: { order: null, installer: null, assignments: [], progress: [] },
      };
    }

    const [installer, assignments, application] = await Promise.all([
      order.installerId
        ? this.installers.findById(order.installerId)
        : Promise.resolve(null),
      this.orders.findAssignments(order.id),
      this.applications.findById(order.applicationId),
    ]);

    const photoUrl = await this.photos.url(installer?.photoKey ?? null);

    return {
      status: true,
      message: 'success',
      data: {
        order: {
          orderNumber: order.orderNumber,
          scheduledDate: order.scheduledDate.toISOString().slice(0, 10),
          timeSlot: order.timeSlot,
          timeSlotLabel: INSTALLATION_SLOT_LABELS[order.timeSlot],
          location: `${order.addressLine}, ${order.city}, ${order.state}`,
          siteContactName: order.siteContactName,
          siteContactPhone: order.siteContactPhone,
          notes: order.notes,
          status: order.status,
          completedAt: order.completedAt?.toISOString() ?? null,
          deviceCount: assignments.length,
        },
        installer: installer
          ? {
              fullName: installer.fullName,
              team: installer.team,
              phoneNumber: installer.phoneNumber,
              email: installer.email,
              photoUrl,
            }
          : null,
        assignments: assignments.map((assignment) => ({
          deviceIndex: assignment.deviceIndex,
          vehicleId: assignment.vehicleId,
        })),
        progress: application ? stageProgress(application.stage) : [],
      },
    };
  }
}
