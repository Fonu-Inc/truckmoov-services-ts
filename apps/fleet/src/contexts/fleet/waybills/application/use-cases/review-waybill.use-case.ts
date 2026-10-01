import { Inject, Injectable } from "@nestjs/common";
import type { Waybill } from "../../domain/entities/waybill.entity";
import {
  DuplicateWaybillNumberError,
  WaybillNotFoundError,
} from "../../domain/errors/waybill.errors";
import {
  WAYBILL_REPOSITORY,
  type WaybillRepository,
} from "../../domain/repositories/waybill.repository";
import { isOnAllowedVehicle } from "../../domain/vehicle-registration";
import { VehicleNotFoundError } from "../../../vehicles";
import { PriceWaybillUseCase } from "./price-waybill.use-case";

export type ReviewWaybillCommand = {
  waybillId: string;
  tenantId: string;
  waybillNumber?: string | null;
  origin?: string | null;
  destination?: string | null;
  vehicleRegistration?: string | null;
  customerName?: string | null;
  weight?: number | null;
  weightUnit?: string | null;
  waybillDate?: string | null;
  /**
   * When set, the waybill and the registration it is corrected to must be on
   * one of these vehicles. Null means no limit.
   */
  allowedRegistrationKeys?: ReadonlySet<string> | null;
};

/**
 * A person confirms or corrects what extraction read.
 *
 * The waybill leaves review as extracted. Pricing happens separately, against
 * the date on the document, so correcting a date here changes which rule the
 * waybill prices under.
 */
@Injectable()
export class ReviewWaybillUseCase {
  constructor(
    @Inject(WAYBILL_REPOSITORY) private readonly waybills: WaybillRepository,
    @Inject(PriceWaybillUseCase) private readonly pricing: PriceWaybillUseCase,
  ) {}

  async execute(command: ReviewWaybillCommand): Promise<Waybill> {
    const waybill = await this.waybills.findById(command.waybillId, command.tenantId);
    const allowed = command.allowedRegistrationKeys;
    // Another owner's waybill reads as missing, not as forbidden.
    if (!waybill || !isOnAllowedVehicle(waybill.vehicleRegistration, allowed)) {
      throw new WaybillNotFoundError(command.waybillId);
    }

    const reviewed = waybill.applyReview(command);
    if (!isOnAllowedVehicle(reviewed.vehicleRegistration, allowed)) {
      throw new VehicleNotFoundError(reviewed.vehicleRegistration ?? "");
    }

    if (reviewed.waybillNumber) {
      const existing = await this.waybills.findByNumber(
        reviewed.waybillNumber,
        command.tenantId,
      );
      if (existing && existing.id !== reviewed.id) {
        throw new DuplicateWaybillNumberError(reviewed.waybillNumber);
      }
    }

    await this.waybills.save(reviewed);
    // Correcting a date or a destination can change which rule applies, so
    // pricing runs again against the corrected values.
    return this.pricing.execute(reviewed);
  }
}
