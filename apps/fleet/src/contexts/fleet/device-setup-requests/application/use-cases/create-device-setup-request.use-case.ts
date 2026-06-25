import { Inject, Injectable } from "@nestjs/common";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";
import {
  DeviceSetupRequest,
  type TrackerType,
} from "../../domain/entities/device-setup-request.entity";
import {
  DEVICE_SETUP_REQUEST_REPOSITORY,
  type DeviceSetupRequestRepository,
} from "../../domain/repositories/device-setup-request.repository";

export type CreateDeviceSetupRequestCommand = {
  tenantId?: string;
  requestedByUserId?: string | null;
  organisationName?: string | null;
  requestingEmail?: string | null;
  manufacturer: string;
  model?: string | null;
  trackerType: TrackerType;
  quantity?: number;
  simRequired?: boolean;
  carrierId?: string | null;
  planType?: string | null;
  bundleId?: string | null;
  vehicleId?: string | null;
  state?: string | null;
  city?: string | null;
  preferredDate?: string | null;
  preferredTime?: string | null;
  useCase: string;
  notes?: string | null;
};

@Injectable()
export class CreateDeviceSetupRequestUseCase {
  constructor(
    @Inject(DEVICE_SETUP_REQUEST_REPOSITORY)
    private readonly repository: DeviceSetupRequestRepository,
    @Inject(FLEET_RUNTIME)
    private readonly runtime: FleetRuntime,
  ) {}

  async execute(command: CreateDeviceSetupRequestCommand) {
    const tenantId = command.tenantId ?? this.runtime.getDefaultTenantId();
    try {
      const request = DeviceSetupRequest.create({
        id: this.runtime.generateId(),
        tenantId,
        requestedByUserId: command.requestedByUserId ?? null,
        organisationName: command.organisationName ?? null,
        requestingEmail: command.requestingEmail ?? null,
        manufacturer: command.manufacturer,
        model: command.model ?? null,
        trackerType: command.trackerType,
        quantity: command.quantity,
        simRequired: command.simRequired,
        carrierId: command.carrierId ?? null,
        planType: command.planType ?? null,
        bundleId: command.bundleId ?? null,
        vehicleId: command.vehicleId ?? null,
        state: command.state ?? null,
        city: command.city ?? null,
        preferredDate: command.preferredDate ?? null,
        preferredTime: command.preferredTime ?? null,
        useCase: command.useCase,
        notes: command.notes ?? null,
      });
      await this.repository.save(request);
      return request.toPrimitives();
    } catch (err) {
      throw new FleetRuleError((err as Error).message);
    }
  }
}
