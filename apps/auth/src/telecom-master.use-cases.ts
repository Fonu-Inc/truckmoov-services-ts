import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor } from './system-authz';
import {
  TELECOM_MASTER_REPOSITORY,
  type StoredTelecomMasterEvent,
  type StoredTelecomMasterRequest,
  type TelecomMasterRepository,
  type TelecomMasterStatus,
} from './telecom-master.repository';

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
    await ensureSystemActor(accessToken, this.tokenService, this.users);
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
      createdAt: now,
    });

    return this.getRequest.detail(id);
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
