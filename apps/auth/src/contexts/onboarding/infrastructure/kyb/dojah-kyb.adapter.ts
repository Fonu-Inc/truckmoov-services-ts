import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '@shared/config';
import type {
  CacRegistrationQuery,
  IdentityQuery,
  KybCheckResult,
  KybVerification,
  TaxIdentificationQuery,
  VehicleRegistrationQuery,
} from '@auth/onboarding/domain/ports/kyb-verification.port';
import {
  compareExact,
  compareName,
  describeMismatch,
  readString,
  requestJson,
  unavailable,
  verdictFrom,
} from './kyb-http';

const PROVIDER = 'dojah';

/**
 * Dojah, used for the TIN check QoreID has no endpoint for.
 *
 * It can answer CAC as well, and is deliberately left not doing so: two
 * providers answering the same check would mean two answers to reconcile and
 * two bills for one question. It is the fallback if QoreID is dropped, not a
 * second opinion.
 *
 * Response field names come from Dojah's published documentation and have not
 * been exercised against a live account.
 */
@Injectable()
export class DojahKybAdapter implements KybVerification {
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  get configured(): boolean {
    const { appId, secretKey } = this.config.kyb.dojah;
    return appId.length > 0 && secretKey.length > 0;
  }

  async verifyTaxIdentification(
    query: TaxIdentificationQuery,
  ): Promise<KybCheckResult> {
    const body = await this.get(
      `kyc/tin?tin=${encodeURIComponent(query.taxIdentificationNumber)}`,
    );
    if (!body) {
      return unavailable(
        'tax_identification',
        query.taxIdentificationNumber,
        PROVIDER,
        'The tax registry did not answer.',
      );
    }

    const taxpayerName = readString(body, 'entity', 'taxpayer_name');
    if (taxpayerName === null) {
      return {
        check: 'tax_identification',
        verdict: 'not_found',
        reference: query.taxIdentificationNumber,
        summary: 'No taxpayer is registered under this number.',
        fields: [],
        provider: PROVIDER,
        checkedAt: new Date(),
      };
    }

    const fields = [
      compareName('Taxpayer name', query.organizationName, taxpayerName),
      compareExact(
        'TIN',
        query.taxIdentificationNumber,
        readString(body, 'entity', 'tin'),
      ),
    ];
    const verdict = verdictFrom(fields);

    return {
      check: 'tax_identification',
      verdict,
      reference: query.taxIdentificationNumber,
      summary:
        verdict === 'match'
          ? 'Every checked field matched the registry.'
          : describeMismatch(fields),
      fields,
      provider: PROVIDER,
      checkedAt: new Date(),
    };
  }

  async verifyCacRegistration(
    query: CacRegistrationQuery,
  ): Promise<KybCheckResult> {
    return unavailable(
      'cac_registration',
      query.rcNumber,
      PROVIDER,
      'Dojah is not the configured provider for CAC.',
    );
  }

  async verifyIdentity(query: IdentityQuery): Promise<KybCheckResult> {
    return unavailable(
      'identity',
      query.identificationNumber,
      PROVIDER,
      'Dojah is not the configured provider for identity.',
    );
  }

  async verifyVehicleRegistration(
    query: VehicleRegistrationQuery,
  ): Promise<KybCheckResult> {
    return unavailable(
      'vehicle_registration',
      query.registrationNumber,
      PROVIDER,
      'Dojah is not the configured provider for vehicle registration.',
    );
  }

  private async get(path: string): Promise<unknown | null> {
    if (!this.configured) return null;

    const { baseUrl, appId, secretKey } = this.config.kyb.dojah;
    return requestJson(`${baseUrl.replace(/\/+$/, '')}/api/v1/${path}`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        AppId: appId,
        Authorization: secretKey,
      },
    });
  }
}
