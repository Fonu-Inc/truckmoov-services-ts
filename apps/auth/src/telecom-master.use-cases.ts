import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Role } from '@shared/rbac';
import { TOKEN_SERVICE, USER_REPOSITORY, ForbiddenError } from './contexts/auth/session';
import { resolveActorUser } from './contexts/auth/session/application/use-cases/support/resolve-actor-user';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import {
  TELECOM_MASTER_REPOSITORY,
  type StoredTelecomMasterEvent,
  type StoredTelecomMasterRequest,
  type TelecomMasterNumberType,
  type TelecomMasterRepository,
  type TelecomMasterStatus,
} from './telecom-master.repository';
import {
  TENANT_ONBOARDING_REPOSITORY,
  type TenantOnboardingRepository,
} from './tenant-onboarding.repository';

export class TelecomMasterRequestNotFoundError extends Error {
  constructor() {
    super('Telecom Master request not found');
    this.name = 'TelecomMasterRequestNotFoundError';
  }
}

export class TelecomMasterRetryNotAllowedError extends Error {
  constructor(status: TelecomMasterStatus) {
    super(`A Telecom Master request in ${status} state cannot be retried`);
    this.name = 'TelecomMasterRetryNotAllowedError';
  }
}

export class TelecomMasterNotAvailableError extends ForbiddenError {
  constructor() {
    super('Telecom Master is only available to enterprise accounts');
  }
}

export class TelecomMasterAlreadyRequestedError extends Error {
  constructor() {
    super('This account already has a Telecom Master request. Contact support to change it.');
    this.name = 'TelecomMasterAlreadyRequestedError';
  }
}

export class TelecomMasterInvalidInputError extends Error {
  constructor(message = 'Enter a valid MTN mobile number.') {
    super(message);
    this.name = 'TelecomMasterInvalidInputError';
  }
}

export class TelecomMasterNumberUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelecomMasterNumberUnavailableError';
  }
}

export class TelecomMasterResolveNotAllowedError extends Error {
  constructor(status: TelecomMasterStatus, outcome: string) {
    super(`A Telecom Master request in ${status} state cannot be marked ${outcome}`);
    this.name = 'TelecomMasterResolveNotAllowedError';
  }
}

const MTN_PREFIXES = new Set([
  '703', '706', '803', '806', '810', '813', '814', '816', '903', '906', '913', '916', '704', '707',
]);

/** 0803…, 803…, 234803… or +234 803… to 234XXXXXXXXXX; null unless an MTN Nigeria mobile number. */
export function normalizeMtnNumber(input: string | null | undefined): string | null {
  const digits = String(input ?? '').replace(/[\s\-().]/g, '').replace(/^\+/, '');
  if (!/^\d+$/.test(digits)) return null;
  const national =
    digits.startsWith('234') && digits.length === 13 ? digits.slice(3)
      : digits.startsWith('0') && digits.length === 11 ? digits.slice(1)
        : digits.length === 10 ? digits
          : null;
  return national && MTN_PREFIXES.has(national.slice(0, 3)) ? `234${national}` : null;
}

/** Where a new request starts: an existing number awaits MTN verification, a new one MTN allocation. */
export function initialTelecomMasterStatus(numberType: TelecomMasterNumberType): TelecomMasterStatus {
  return numberType === 'existing' ? 'pending_verification' : 'allocation_pending';
}

export type TelecomMasterOutcome = 'verified' | 'verification_failed' | 'allocated' | 'allocation_failed';

/** The outcomes staff may record from each pending state; null when the move is not allowed. */
export function resolveTransition(
  status: TelecomMasterStatus,
  outcome: TelecomMasterOutcome,
): TelecomMasterStatus | null {
  if (status === 'pending_verification' && (outcome === 'verified' || outcome === 'verification_failed')) {
    return outcome;
  }
  if (status === 'allocation_pending' && (outcome === 'allocated' || outcome === 'allocation_failed')) {
    return outcome;
  }
  return null;
}

function requestView(request: StoredTelecomMasterRequest) {
  return {
    id: request.id,
    tenantId: request.tenantId,
    organizationName: request.organizationName,
    contactEmail: request.contactEmail,
    applicationId: request.applicationId,
    applicationReference: request.applicationReference,
    msisdn: request.msisdn,
    simSerial: request.simSerial,
    numberType: request.numberType,
    status: request.status,
    mtnReference: request.mtnReference,
    failureReason: request.failureReason,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

function eventView(event: StoredTelecomMasterEvent) {
  return {
    id: event.id,
    requestId: event.requestId,
    action: event.action,
    detail: event.detail,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    actorId: event.actorId,
    createdAt: event.createdAt.toISOString(),
  };
}

@Injectable()
export class ListTelecomMasterRequestsUseCase {
  constructor(
    @Inject(TELECOM_MASTER_REPOSITORY)
    private readonly repository: TelecomMasterRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.users);
    const requests = await this.repository.findAll();
    return {
      status: true,
      message: 'success',
      data: {
        requests: requests.map(requestView),
        total: requests.length,
        generatedAt: new Date().toISOString(),
      },
    };
  }
}

@Injectable()
export class GetTelecomMasterRequestUseCase {
  constructor(
    @Inject(TELECOM_MASTER_REPOSITORY)
    private readonly repository: TelecomMasterRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute(accessToken: string, id: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.users);
    return this.detail(id);
  }

  async detail(id: string) {
    const request = await this.repository.findById(id);
    if (!request) throw new TelecomMasterRequestNotFoundError();
    const events = await this.repository.findEvents(id);
    return {
      status: true,
      message: 'success',
      data: {
        request: requestView(request),
        events: events.map(eventView),
      },
    };
  }
}

@Injectable()
export class RetryTelecomMasterRequestUseCase {
  constructor(
    @Inject(TELECOM_MASTER_REPOSITORY)
    private readonly repository: TelecomMasterRepository,
    @Inject(GetTelecomMasterRequestUseCase)
    private readonly getRequest: GetTelecomMasterRequestUseCase,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute(accessToken: string, id: string) {
    const actor = await ensureSystemActor(accessToken, this.tokenService, this.users);
    const request = await this.repository.findById(id);
    if (!request) throw new TelecomMasterRequestNotFoundError();

    const next = retryTransition(request.status);
    if (!next) throw new TelecomMasterRetryNotAllowedError(request.status);

    const now = new Date();
    await this.repository.save({
      ...request,
      status: next.status,
      failureReason: null,
      mtnReference: null,
      updatedAt: now,
    });
    await this.repository.appendEvent({
      id: randomUUID(),
      requestId: request.id,
      action: next.action,
      detail: 'Retry requested by a platform admin',
      fromStatus: request.status,
      toStatus: next.status,
      actorId: actor.id,
      createdAt: now,
    });

    return this.getRequest.detail(id);
  }
}

@Injectable()
export class ResolveTelecomMasterRequestUseCase {
  constructor(
    @Inject(TELECOM_MASTER_REPOSITORY)
    private readonly repository: TelecomMasterRepository,
    @Inject(GetTelecomMasterRequestUseCase)
    private readonly getRequest: GetTelecomMasterRequestUseCase,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  /** Records MTN's answer by hand while the MTN verification and allocation APIs are not integrated. */
  async execute(
    accessToken: string,
    id: string,
    input: {
      outcome: TelecomMasterOutcome;
      msisdn?: string;
      simSerial?: string;
      mtnReference?: string;
      failureReason?: string;
    },
  ) {
    const actor = await ensureSystemActor(accessToken, this.tokenService, this.users);
    const request = await this.repository.findById(id);
    if (!request) throw new TelecomMasterRequestNotFoundError();

    const next = resolveTransition(request.status, input.outcome);
    if (!next) throw new TelecomMasterResolveNotAllowedError(request.status, input.outcome);

    const failed = next.endsWith('_failed');
    if (failed && !input.failureReason?.trim()) {
      throw new TelecomMasterInvalidInputError('A failure reason is required');
    }

    let msisdn = request.msisdn;
    if (next === 'allocated') {
      msisdn = normalizeMtnNumber(input.msisdn);
      if (!msisdn) throw new TelecomMasterInvalidInputError();
      await assertNumberUsable(this.repository, msisdn, request.id);
    }

    const now = new Date();
    await this.repository.save({
      ...request,
      status: next,
      msisdn,
      simSerial: next === 'allocated' ? input.simSerial?.trim() || null : request.simSerial,
      mtnReference: input.mtnReference?.trim() || request.mtnReference,
      failureReason: failed ? input.failureReason!.trim() : null,
      updatedAt: now,
    });
    await this.repository.appendEvent({
      id: randomUUID(),
      requestId: request.id,
      action: `admin_${next}`,
      detail: failed ? input.failureReason!.trim() : null,
      fromStatus: request.status,
      toStatus: next,
      actorId: actor.id,
      createdAt: now,
    });

    return this.getRequest.detail(id);
  }
}

export async function assertNumberUsable(
  repository: TelecomMasterRepository,
  msisdn: string,
  exceptRequestId?: string,
) {
  if (await repository.isDeviceSimMsisdn(msisdn)) {
    throw new TelecomMasterNumberUnavailableError(
      'This number is a tracking device SIM and cannot be a Telecom Master.',
    );
  }
  if (await repository.isMsisdnTaken(msisdn, exceptRequestId)) {
    throw new TelecomMasterNumberUnavailableError(
      'This number is already linked to another enterprise account.',
    );
  }
}

const TELECOM_MASTER_ORG_TYPES = new Set(['enterprise', 'aggregator']);

@Injectable()
export class TenantTelecomMasterUseCases {
  constructor(
    @Inject(TELECOM_MASTER_REPOSITORY)
    private readonly repository: TelecomMasterRepository,
    @Inject(TENANT_ONBOARDING_REPOSITORY)
    private readonly onboarding: TenantOnboardingRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async current(accessToken: string) {
    const { actor } = await this.requireEnterprise(accessToken);
    const request = await this.repository.findLatestForTenant(actor.tenantId);
    return { status: true, message: 'success', data: { request: request ? requestView(request) : null } };
  }

  async submit(accessToken: string, input: { numberType: TelecomMasterNumberType; msisdn?: string }) {
    const { actor, onboarding } = await this.requireEnterprise(accessToken);

    const latest = await this.repository.findLatestForTenant(actor.tenantId);
    if (latest && !latest.status.endsWith('_failed')) throw new TelecomMasterAlreadyRequestedError();

    let msisdn: string | null = null;
    if (input.numberType === 'existing') {
      msisdn = normalizeMtnNumber(input.msisdn);
      if (!msisdn) throw new TelecomMasterInvalidInputError();
      await assertNumberUsable(this.repository, msisdn);
    }

    const now = new Date();
    const id = randomUUID();
    const request: StoredTelecomMasterRequest = {
      id,
      tenantId: actor.tenantId,
      organizationName: onboarding.company.companyName,
      contactEmail: onboarding.company.email || actor.email,
      applicationId: null,
      applicationReference: `TM-${id.slice(0, 8).toUpperCase()}`,
      msisdn,
      simSerial: null,
      numberType: input.numberType,
      status: initialTelecomMasterStatus(input.numberType),
      mtnReference: null,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.save(request);
    await this.repository.appendEvent({
      id: randomUUID(),
      requestId: id,
      action: 'created',
      // shortcut: MTN verification/allocation APIs are not integrated, so requests wait for staff to resolve them.
      detail: `Requested from Settings (${input.numberType}); awaiting MTN`,
      fromStatus: null,
      toStatus: request.status,
      actorId: actor.id,
      createdAt: now,
    });
    return { status: true, message: 'success', data: { request: requestView(request) } };
  }

  private async requireEnterprise(accessToken: string) {
    const actor = await resolveActorUser(accessToken, this.tokenService, this.users);
    const onboarding = await this.onboarding.findByTenantId(actor.tenantId);
    if (
      !onboarding
      || !TELECOM_MASTER_ORG_TYPES.has(onboarding.organizationType)
      || actor.role === Role.OWNER_OPERATOR
    ) {
      throw new TelecomMasterNotAvailableError();
    }
    return { actor, onboarding };
  }
}

function retryTransition(status: TelecomMasterStatus): {
  status: TelecomMasterStatus;
  action: string;
} | null {
  if (status === 'verification_failed') {
    return { status: 'pending_verification', action: 'retry_verification' };
  }
  if (status === 'allocation_failed') {
    return { status: 'allocation_pending', action: 'retry_allocation' };
  }
  return null;
}

/** The apply wizard's side of Telecom Master: checks a number before the account exists, and opens the request at approval. */
@Injectable()
export class ApplicationTelecomMasterUseCases {
  constructor(
    @Inject(TELECOM_MASTER_REPOSITORY)
    private readonly repository: TelecomMasterRepository,
  ) {}

  // shortcut: MTN prefix + not taken + not a device SIM; MTN exposes no subscriber lookup, swap in when it does.
  async verify(input: string | undefined) {
    const msisdn = normalizeMtnNumber(input);
    if (!msisdn) throw new TelecomMasterInvalidInputError();
    await assertNumberUsable(this.repository, msisdn);
    return { status: true, message: 'Number verified', data: { msisdn } };
  }

  async openForApplication(application: {
    id: string;
    reference: string;
    tenantId: string;
    organizationName: string;
    businessEmail: string;
    numberType: TelecomMasterNumberType;
    msisdn: string | null;
  }) {
    let status = initialTelecomMasterStatus(application.numberType);
    let failureReason: string | null = null;
    if (application.msisdn) {
      // The number may have been claimed while the application sat in review; record it, don't block approval.
      failureReason = await assertNumberUsable(this.repository, application.msisdn).then(
        () => null,
        (error: Error) => error.message,
      );
      if (failureReason) status = 'verification_failed';
    }
    const now = new Date();
    const id = randomUUID();
    await this.repository.save({
      id,
      tenantId: application.tenantId,
      organizationName: application.organizationName,
      contactEmail: application.businessEmail,
      applicationId: application.id,
      applicationReference: application.reference,
      msisdn: application.msisdn,
      simSerial: null,
      numberType: application.numberType,
      status,
      mtnReference: null,
      failureReason,
      createdAt: now,
      updatedAt: now,
    });
    await this.repository.appendEvent({
      id: randomUUID(),
      requestId: id,
      action: 'created',
      detail: `Requested on application ${application.reference} (${application.numberType}); awaiting MTN`,
      fromStatus: null,
      toStatus: status,
      actorId: null,
      createdAt: now,
    });
  }
}
