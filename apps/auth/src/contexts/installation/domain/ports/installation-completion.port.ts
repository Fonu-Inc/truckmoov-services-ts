import type { InstallationOrderStatus } from '../installation-order';
import type { StoredInstallationOrder } from '../installation-order.repository';

export interface InstallationCompletion {
  /**
   * Holds the order while it is still `from` and its onboarding at installation,
   * runs `handOver`, then writes the order and moves the onboarding to
   * connectivity_verification together. False, with nothing run or written, when
   * either moved or another completion holds the order; a `handOver` failure
   * writes nothing.
   */
  complete(
    completed: StoredInstallationOrder,
    from: InstallationOrderStatus,
    handOver: () => Promise<void>,
  ): Promise<boolean>;
}

export const INSTALLATION_COMPLETION = Symbol('INSTALLATION_COMPLETION');
