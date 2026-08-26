import { Inject, Injectable } from "@nestjs/common";
import type { Waybill } from "../../domain/entities/waybill.entity";
import {
  WAYBILL_REPOSITORY,
  type WaybillFilters,
  type WaybillRepository,
} from "../../domain/repositories/waybill.repository";

/** A page bigger than this is a report, not a screen. */
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

@Injectable()
export class ListWaybillsUseCase {
  constructor(@Inject(WAYBILL_REPOSITORY) private readonly waybills: WaybillRepository) {}

  async execute(filters: WaybillFilters) {
    const limit = Math.min(filters.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = Math.max(filters.offset ?? 0, 0);

    const [page, counts] = await Promise.all([
      this.waybills.search({ ...filters, limit, offset }),
      // Counted independently of the page. The summary figures describe every
      // waybill the tenant has, not the twenty-five currently on screen.
      this.waybills.countByStatus(filters.tenantId),
    ]);

    return {
      summary: {
        totalWaybills: Object.values(counts).reduce((sum, count) => sum + count, 0),
        extracted: counts.extracted,
        needsReview: counts.needs_review,
        invoiced: counts.invoiced,
      },
      waybills: page.items.map(toWaybillRow),
      page: { total: page.total, limit, offset },
    };
  }
}

export function toWaybillRow(waybill: Waybill) {
  return {
    id: waybill.id,
    status: waybill.status,
    source: waybill.source,
    waybillNumber: waybill.waybillNumber,
    origin: waybill.origin,
    destination: waybill.destination,
    vehicleRegistration: waybill.vehicleRegistration,
    customerName: waybill.customerName,
    priceKobo: waybill.priceKobo,
    waybillDate: waybill.waybillDate,
    imageKey: waybill.imageKey,
    imageSha256: waybill.imageSha256,
    extractedFields: waybill.extractedFields,
    extractionError: waybill.extractionError,
    invoiceId: waybill.invoiceId,
    pricingRuleId: waybill.pricingRuleId,
    replyChannel: waybill.replyChannel,
    replyAddress: waybill.replyAddress,
    createdAt: waybill.createdAt,
  };
}
