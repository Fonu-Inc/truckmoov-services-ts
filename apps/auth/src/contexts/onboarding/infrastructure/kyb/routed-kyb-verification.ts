import { Inject, Injectable } from '@nestjs/common';
import type {
  CacRegistrationQuery,
  IdentityQuery,
  KybCheckResult,
  KybVerification,
  TaxIdentificationQuery,
  VehicleRegistrationQuery,
} from '@auth/onboarding/domain/ports/kyb-verification.port';
import { DojahKybAdapter } from './dojah-kyb.adapter';
import { QoreIdKybAdapter } from './qoreid-kyb.adapter';
import { unavailable } from './kyb-http';

/**
 * Sends each check to the provider that answers it.
 *
 * No Nigerian vendor covers CAC, FIRS and FRSC, so which provider answers a
 * check is a deployment fact. Keeping the routing here means the decision
 * logic asks for a verdict and never learns whose it was, which is what makes
 * a vendor swap a change to this file alone.
 *
 * An unconfigured provider returns `unavailable`, which routes the application
 * to a human. That is the deliberate behaviour in an environment with no
 * credentials: nothing is silently approved because nothing was asked.
 */
@Injectable()
export class RoutedKybVerification implements KybVerification {
  constructor(
    @Inject(QoreIdKybAdapter) private readonly qoreid: QoreIdKybAdapter,
    @Inject(DojahKybAdapter) private readonly dojah: DojahKybAdapter,
  ) {}

  async verifyCacRegistration(
    query: CacRegistrationQuery,
  ): Promise<KybCheckResult> {
    if (!this.qoreid.configured) {
      return unavailable(
        'cac_registration',
        query.rcNumber,
        'none',
        'No CAC provider is configured.',
      );
    }
    return this.qoreid.verifyCacRegistration(query);
  }

  async verifyTaxIdentification(
    query: TaxIdentificationQuery,
  ): Promise<KybCheckResult> {
    if (!this.dojah.configured) {
      return unavailable(
        'tax_identification',
        query.taxIdentificationNumber,
        'none',
        'No tax identification provider is configured.',
      );
    }
    return this.dojah.verifyTaxIdentification(query);
  }

  async verifyIdentity(query: IdentityQuery): Promise<KybCheckResult> {
    if (!this.qoreid.configured) {
      return unavailable(
        'identity',
        query.identificationNumber,
        'none',
        'No identity provider is configured.',
      );
    }
    return this.qoreid.verifyIdentity(query);
  }

  async verifyVehicleRegistration(
    query: VehicleRegistrationQuery,
  ): Promise<KybCheckResult> {
    if (!this.qoreid.configured) {
      return unavailable(
        'vehicle_registration',
        query.registrationNumber,
        'none',
        'No vehicle registry provider is configured.',
      );
    }
    return this.qoreid.verifyVehicleRegistration(query);
  }
}
