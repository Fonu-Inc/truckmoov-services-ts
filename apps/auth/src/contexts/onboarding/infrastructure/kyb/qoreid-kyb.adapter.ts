import { Inject, Injectable, Logger } from '@nestjs/common';
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

const PROVIDER = 'qoreid';

/**
 * The three identification types the platform accepts, each with its QoreID
 * path segment and the key its record sits under in the response. Adding a type
 * is one row here and one entry in ONBOARDING_IDENTIFICATION_TYPES.
 */
const IDENTITY_ENDPOINTS: Record<string, { path: string; record: string }> = {
  nin: { path: 'nin', record: 'nin' },
  drivers_licence: { path: 'driver-license', record: 'drivers_license' },
  passport: { path: 'passport', record: 'passport' },
};

/**
 * QoreID: CAC, NIN, driver's licence, international passport and the FRSC
 * licence plate record.
 *
 * QoreID publishes no TIN endpoint, so tax identification is not answered here
 * and falls to whichever adapter is configured for it.
 *
 * The response field names below come from QoreID's published documentation
 * and have not been exercised against a live account. They are read through
 * `readString` and mapped in one place per check so a correction is a one-line
 * change rather than a hunt.
 */
@Injectable()
export class QoreIdKybAdapter implements KybVerification {
  private readonly logger = new Logger(QoreIdKybAdapter.name);
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  get configured(): boolean {
    const { clientId, secret } = this.config.kyb.qoreid;
    return clientId.length > 0 && secret.length > 0;
  }

  async verifyCacRegistration(
    query: CacRegistrationQuery,
  ): Promise<KybCheckResult> {
    const body = await this.call(`identities/cac-basic/${encodeURIComponent(query.rcNumber)}`, {
      regNumber: query.rcNumber,
    });
    if (!body) {
      return unavailable(
        'cac_registration',
        query.rcNumber,
        PROVIDER,
        'The CAC registry did not answer.',
      );
    }

    const companyName = readString(body, 'cac', 'companyName');
    if (companyName === null) {
      return {
        check: 'cac_registration',
        verdict: 'not_found',
        reference: query.rcNumber,
        summary: 'No company is registered under this number.',
        fields: [],
        provider: PROVIDER,
        checkedAt: new Date(),
      };
    }

    const fields = [
      compareName('Company name', query.organizationName, companyName),
      compareExact('RC number', query.rcNumber, readString(body, 'cac', 'rcNumber')),
    ];
    return this.resultOf('cac_registration', query.rcNumber, fields);
  }

  async verifyTaxIdentification(
    query: TaxIdentificationQuery,
  ): Promise<KybCheckResult> {
    return unavailable(
      'tax_identification',
      query.taxIdentificationNumber,
      PROVIDER,
      'QoreID does not answer tax identification.',
    );
  }

  async verifyIdentity(query: IdentityQuery): Promise<KybCheckResult> {
    const endpoint = IDENTITY_ENDPOINTS[query.identificationType];
    if (!endpoint) {
      return unavailable(
        'identity',
        query.identificationNumber,
        PROVIDER,
        `QoreID does not answer ${query.identificationType} identification.`,
      );
    }

    const [firstname = '', ...rest] = query.contactFullName.split(' ');
    const body = await this.call(
      `identities/${endpoint.path}/${encodeURIComponent(query.identificationNumber)}`,
      { firstname, lastname: rest.join(' ') },
    );
    if (!body) {
      return unavailable(
        'identity',
        query.identificationNumber,
        PROVIDER,
        'The identity registry did not answer.',
      );
    }

    const registryFirst = readString(body, endpoint.record, 'firstname');
    if (registryFirst === null) {
      return {
        check: 'identity',
        verdict: 'not_found',
        reference: query.identificationNumber,
        summary: 'No record is held for this identification number.',
        fields: [],
        provider: PROVIDER,
        checkedAt: new Date(),
      };
    }

    const fields = [
      compareName(
        'Name on the identification',
        query.contactFullName,
        `${registryFirst} ${readString(body, endpoint.record, 'lastname') ?? ''}`.trim(),
      ),
    ];
    return this.resultOf('identity', query.identificationNumber, fields);
  }

  async verifyVehicleRegistration(
    query: VehicleRegistrationQuery,
  ): Promise<KybCheckResult> {
    const body = await this.call(
      `identities/license-plate-basic/${encodeURIComponent(query.registrationNumber)}`,
      {},
    );
    if (!body) {
      return unavailable(
        'vehicle_registration',
        query.registrationNumber,
        PROVIDER,
        'The vehicle registry did not answer.',
      );
    }

    const owner = [
      readString(body, 'license_plate', 'firstname'),
      readString(body, 'license_plate', 'lastname'),
    ]
      .filter((part): part is string => part !== null)
      .join(' ');

    if (owner.length === 0) {
      return {
        check: 'vehicle_registration',
        verdict: 'not_found',
        reference: query.registrationNumber,
        summary: 'No vehicle is registered under this plate.',
        fields: [],
        provider: PROVIDER,
        checkedAt: new Date(),
      };
    }

    const fields = [
      compareName('Registered owner', query.expectedOwnerName, owner),
    ];
    // Only compared when the applicant supplied one: a blank chassis number is
    // a gap in the form, not a disagreement with the registry.
    if (query.chassisNumber) {
      fields.push(
        compareExact(
          'Chassis number',
          query.chassisNumber,
          readString(body, 'license_plate', 'chassisNumber'),
        ),
      );
    }
    return this.resultOf(
      'vehicle_registration',
      query.registrationNumber,
      fields,
    );
  }

  private resultOf(
    check: KybCheckResult['check'],
    reference: string,
    fields: KybCheckResult['fields'],
  ): KybCheckResult {
    const verdict = verdictFrom(fields);
    return {
      check,
      verdict,
      reference,
      summary:
        verdict === 'match'
          ? 'Every checked field matched the registry.'
          : describeMismatch(fields),
      fields,
      provider: PROVIDER,
      checkedAt: new Date(),
    };
  }

  private async call(
    path: string,
    body: Record<string, string>,
  ): Promise<unknown | null> {
    if (!this.configured) return null;

    const token = await this.accessToken();
    if (!token) return null;

    const base = this.config.kyb.qoreid.baseUrl.replace(/\/+$/, '');
    return requestJson(`${base}/v1/ng/${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  }

  /**
   * Cached until shortly before it expires.
   *
   * Every check would otherwise open with a token request, which doubles the
   * calls to a metered vendor and the time an applicant waits.
   */
  private async accessToken(): Promise<string | null> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;

    const { baseUrl, clientId, secret } = this.config.kyb.qoreid;
    const body = await requestJson(`${baseUrl.replace(/\/+$/, '')}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId, secret }),
    });

    const value = readString(body, 'accessToken');
    if (!value) {
      this.logger.warn('qoreid_token_request_failed');
      this.token = null;
      return null;
    }

    const expiresIn = Number(readString(body, 'expiresIn') ?? 0);
    const lifetimeMs = (expiresIn > 0 ? expiresIn : 3600) * 1000;
    this.token = { value, expiresAt: Date.now() + lifetimeMs - 60_000 };
    return value;
  }
}
