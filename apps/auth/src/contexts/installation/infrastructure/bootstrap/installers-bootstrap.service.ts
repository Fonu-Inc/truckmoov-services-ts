import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import {
  INSTALLER_REPOSITORY,
  type InstallerRepository,
} from '@auth/installation/domain/installer.repository';

type InstallerSeed = {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  team: string;
  state: string;
};

/**
 * FIX: hard-coded until installers are managed from the platform admin
 * screens. Without at least one, every installation is booked unassigned,
 * which is a worse first impression than a placeholder name.
 */
export const INSTALLER_SEEDS: readonly InstallerSeed[] = [
  {
    id: 'installer-lagos-1',
    fullName: 'Chinedu Okafor',
    email: 'chinedu.okafor@fleetpro.ng',
    phoneNumber: '+2348024117765',
    team: 'Lagos Installation Team 3',
    state: 'Lagos',
  },
  {
    id: 'installer-abuja-1',
    fullName: 'Adaeze Nwosu',
    email: 'adaeze.nwosu@fleetpro.ng',
    phoneNumber: '+2348024117766',
    team: 'Abuja Installation Team 1',
    state: 'FCT',
  },
];

@Injectable()
export class InstallersBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(InstallersBootstrapService.name);

  constructor(
    @Inject(INSTALLER_REPOSITORY)
    private readonly installers: InstallerRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const now = new Date();

    for (const seed of INSTALLER_SEEDS) {
      // Seeded once and then left alone: a deploy must not reactivate somebody
      // who was deactivated on purpose.
      if (await this.installers.findById(seed.id)) continue;

      await this.installers.save({
        ...seed,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      this.logger.log(`Seeded installer ${seed.fullName}`);
    }
  }
}
