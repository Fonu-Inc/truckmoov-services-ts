import { Inject, Injectable } from '@nestjs/common';
import { canTransitionSetupRequest } from '@shared/devices';
import { TOKEN_SERVICE } from './contexts/auth/session';
import type { TokenService } from './contexts/auth/session/domain/ports/token-service.port';
import {
  INSTALLER_REPOSITORY,
  type InstallerRepository,
} from './contexts/installation/domain/installer.repository';
import { currentInstaller } from './contexts/installation/application/use-cases/support/current-installer';
import {
  appendSetupRequestTimeline,
  DEVICE_SETUP_REQUEST_REPOSITORY,
  type DeviceSetupRequestRepository,
  type StoredDeviceSetupRequest,
} from './device-setup-request.repository';
import { DeviceSetupRequestNotFoundError } from './get-system-device-setup-request.use-case';

export class DeviceSetupRequestNotInProgressError extends Error {
  constructor(readonly currentStatus: string) {
    super(`Only a device request being installed can be completed. This one is ${currentStatus}`);
  }
}

/** What the installer needs to do the fitting; no charges or decision details. */
export function installerDeviceSetupRequestView(r: StoredDeviceSetupRequest) {
  return {
    id: r.id,
    referenceNumber: r.referenceNumber,
    organisationName: r.organisationName,
    manufacturer: r.manufacturer,
    model: r.model,
    trackerType: r.trackerType,
    quantity: r.quantity,
    simRequired: r.simRequired,
    vehicleId: r.vehicleId,
    state: r.state,
    city: r.city,
    preferredInstallDate: r.preferredInstallDate?.toISOString() ?? null,
    useCase: r.useCase,
    notes: r.notes,
    status: r.status,
    timeline: r.timeline,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Device requests the platform assigned to the calling installer. Anyone else's reads as missing. */
@Injectable()
export class InstallerDeviceSetupRequestsUseCases {
  constructor(
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(INSTALLER_REPOSITORY) private readonly installers: InstallerRepository,
    @Inject(DEVICE_SETUP_REQUEST_REPOSITORY) private readonly repo: DeviceSetupRequestRepository,
  ) {}

  async list(accessToken: string) {
    const installer = await this.installer(accessToken);
    const requests = await this.repo.findAll({ assignedTo: installer.id });
    return requests.map(installerDeviceSetupRequestView);
  }

  async complete(accessToken: string, requestId: string) {
    const installer = await this.installer(accessToken);
    const request = await this.repo.findById(requestId);
    if (!request || request.assignedTo !== installer.id) throw new DeviceSetupRequestNotFoundError(requestId);
    if (!canTransitionSetupRequest(request.status, 'completed')) {
      throw new DeviceSetupRequestNotInProgressError(request.status);
    }

    await this.repo.advance({
      id: requestId,
      status: 'completed',
      timeline: appendSetupRequestTimeline(request, 'completed', `Completed by installer ${installer.code}`),
    });
    const updated = await this.repo.findById(requestId);
    if (!updated) throw new DeviceSetupRequestNotFoundError(requestId);
    return installerDeviceSetupRequestView(updated);
  }

  private installer(accessToken: string) {
    return currentInstaller({ tokens: this.tokens, installers: this.installers }, accessToken);
  }
}
