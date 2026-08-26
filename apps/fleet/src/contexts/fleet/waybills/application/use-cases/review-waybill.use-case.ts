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
  constructor(@Inject(WAYBILL_REPOSITORY) private readonly waybills: WaybillRepository) {}

  async execute(command: ReviewWaybillCommand): Promise<Waybill> {
    const waybill = await this.waybills.findById(command.waybillId, command.tenantId);
    if (!waybill) throw new WaybillNotFoundError(command.waybillId);

    const reviewed = waybill.applyReview(command);

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
    return reviewed;
  }
}
