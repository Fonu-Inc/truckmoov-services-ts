import { Inject, Injectable } from '@nestjs/common';
import { canTransitionSetupRequest, type DeviceSetupRequestCharges } from '@shared/devices';
import { TOKEN_SERVICE, USER_REPOSITORY } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import type { UserRepository } from './contexts/auth/session/domain/ports/user-repository.port';
import { ensureSystemActor, SYSTEM_MUTATOR_ROLES } from './system-authz';
import {
  appendSetupRequestTimeline,
  DEVICE_SETUP_REQUEST_REPOSITORY,
  type DeviceSetupRequestRepository,
  type DeviceSetupRequestStatus,
  type StoredDeviceSetupRequest,
} from './device-setup-request.repository';
import { settleApprovedPayment } from './device-setup-payment-settlement';
import { DeviceSetupRequestPricingService } from './device-setup-request-pricing.service';
import {
  DeviceSetupRequestNotFoundError,
  serializeDeviceSetupRequest,
} from './get-system-device-setup-request.use-case';

export class DeviceSetupRequestAlreadyDecidedError extends Error {
  constructor(readonly currentStatus: string) {
    super(`This device request has already been decided. It is ${currentStatus}`);
  }
}

export class DeviceSetupRejectionReasonRequiredError extends Error {
  constructor() {
    super('A rejection needs a reason the tenant can act on');
  }
}

type DecisionOutcome = {
  status: DeviceSetupRequestStatus;
  timeline: StoredDeviceSetupRequest['timeline'];
  charges: DeviceSetupRequestCharges | null;
};

/**
 * Approve and reject share everything but the outcome, so they share a base.
 * Both are only valid on a request still waiting for a decision: deciding twice
 * would overwrite the first decision and the tenant has already been told.
 */
abstract class DecideDeviceSetupRequestUseCase {
  protected abstract readonly decision: Extract<
    DeviceSetupRequestStatus,
    'awaiting_payment' | 'rejected'
  >;
  protected abstract readonly message: string;
  protected abstract readonly forbiddenMessage: string;

  constructor(
    private readonly tokenService: TokenService,
    private readonly userRepository: UserRepository,
    private readonly repo: DeviceSetupRequestRepository,
  ) {}

  protected abstract outcome(request: StoredDeviceSetupRequest, note: string | null): Promise<DecisionOutcome>;

  protected async decide(accessToken: string, requestId: string, reason: string | null) {
    const actor = await ensureSystemActor(
      accessToken,
      this.tokenService,
      this.userRepository,
      { allowedRoles: SYSTEM_MUTATOR_ROLES, forbiddenMessage: this.forbiddenMessage },
    );

    const request = await this.repo.findById(requestId);
    if (!request) throw new DeviceSetupRequestNotFoundError(requestId);
    if (!canTransitionSetupRequest(request.status, this.decision)) {
      throw new DeviceSetupRequestAlreadyDecidedError(request.status);
    }

    const trimmed = reason?.trim() || null;
    await this.repo.recordDecision({
      id: requestId,
      decidedBy: actor.id,
      reason: trimmed,
      ...(await this.outcome(request, trimmed)),
    });

    const updated = await this.repo.findById(requestId);
    if (!updated) throw new DeviceSetupRequestNotFoundError(requestId);

    return {
      status: true,
      message: this.message,
      data: serializeDeviceSetupRequest(updated),
    };
  }
}

function chargesNote(charges: DeviceSetupRequestCharges, note: string | null): string {
  const total = `Charges: NGN ${(charges.totalKobo / 100).toFixed(2)}`;
  return note ? `${note} · ${total}` : total;
}

@Injectable()
export class ApproveSystemDeviceSetupRequestUseCase extends DecideDeviceSetupRequestUseCase {
  protected readonly decision = 'awaiting_payment' as const;
  protected readonly message = 'Device setup request approved';
  protected readonly forbiddenMessage = 'You are not permitted to approve device setup requests';

  constructor(
    @Inject(TOKEN_SERVICE) tokenService: TokenService,
    @Inject(USER_REPOSITORY) userRepository: UserRepository,
    @Inject(DEVICE_SETUP_REQUEST_REPOSITORY) repo: DeviceSetupRequestRepository,
    @Inject(DeviceSetupRequestPricingService) private readonly pricing: DeviceSetupRequestPricingService,
  ) {
    super(tokenService, userRepository, repo);
  }

  async execute(accessToken: string, requestId: string, note?: string) {
    return this.decide(accessToken, requestId, note ?? null);
  }

  // Priced before anything is written, so an unpriceable request stays under review.
  protected async outcome(request: StoredDeviceSetupRequest, note: string | null): Promise<DecisionOutcome> {
    const charges = await this.pricing.chargesFor(request.tenantId, request.quantity);
    const priced = appendSetupRequestTimeline(request, 'awaiting_payment', chargesNote(charges, note));
    return { ...settleApprovedPayment(priced), charges };
  }
}

@Injectable()
export class RejectSystemDeviceSetupRequestUseCase extends DecideDeviceSetupRequestUseCase {
  protected readonly decision = 'rejected' as const;
  protected readonly message = 'Device setup request rejected';
  protected readonly forbiddenMessage = 'You are not permitted to reject device setup requests';

  constructor(
    @Inject(TOKEN_SERVICE) tokenService: TokenService,
    @Inject(USER_REPOSITORY) userRepository: UserRepository,
    @Inject(DEVICE_SETUP_REQUEST_REPOSITORY) repo: DeviceSetupRequestRepository,
  ) {
    super(tokenService, userRepository, repo);
  }

  async execute(accessToken: string, requestId: string, reason: string) {
    return this.decide(accessToken, requestId, reason);
  }

  protected async outcome(request: StoredDeviceSetupRequest, reason: string | null): Promise<DecisionOutcome> {
    if (!reason) throw new DeviceSetupRejectionReasonRequiredError();
    return { status: 'rejected', timeline: appendSetupRequestTimeline(request, 'rejected', reason), charges: null };
  }
}

@Injectable()
export class GetSystemDeviceSetupSummaryUseCase {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokenService: TokenService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
    @Inject(DEVICE_SETUP_REQUEST_REPOSITORY)
    private readonly repo: DeviceSetupRequestRepository,
  ) {}

  async execute(accessToken: string) {
    await ensureSystemActor(accessToken, this.tokenService, this.userRepository, {
      forbiddenMessage: 'You are not permitted to view device setup requests',
    });

    return {
      status: true,
      message: 'success',
      data: await this.repo.summary(),
    };
  }
}
