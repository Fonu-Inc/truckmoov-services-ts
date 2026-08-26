import { Inject, Injectable, Logger } from "@nestjs/common";
import { AppConfigService } from "@shared/config";
import type { Waybill } from "../../domain/entities/waybill.entity";
import {
  WAYBILL_EXTRACTOR,
  type WaybillExtractor,
} from "../../domain/ports/waybill-extractor.port";
import {
  WAYBILL_REPOSITORY,
  type WaybillRepository,
} from "../../domain/repositories/waybill.repository";
import { PriceWaybillUseCase } from "./price-waybill.use-case";

export type ApplyWaybillExtractionCommand = {
  waybillId: string;
  tenantId: string;
};

/**
 * Runs extraction against a captured waybill and records what came back.
 *
 * Safe to run twice. JetStream redelivers, and a waybill that has since been
 * priced or invoiced must keep the values it was priced on — rewriting them
 * would change an amount a customer has already been billed.
 */
@Injectable()
export class ApplyWaybillExtractionUseCase {
  private readonly logger = new Logger(ApplyWaybillExtractionUseCase.name);

  constructor(
    @Inject(WAYBILL_REPOSITORY) private readonly waybills: WaybillRepository,
    @Inject(WAYBILL_EXTRACTOR) private readonly extractor: WaybillExtractor,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(PriceWaybillUseCase) private readonly pricing: PriceWaybillUseCase,
  ) {}

  async execute(command: ApplyWaybillExtractionCommand): Promise<Waybill | null> {
    const waybill = await this.waybills.findById(command.waybillId, command.tenantId);
    if (!waybill) return null;
    if (!waybill.acceptsExtraction) {
      this.logger.log(`waybill_extraction_skipped:${waybill.id}:${waybill.status}`);
      return waybill;
    }
    if (!waybill.imageKey) {
      return this.save(waybill.failExtraction("The waybill has no stored image."));
    }

    const result = await this.extractor.extract({
      imageKey: waybill.imageKey,
      tenantId: waybill.tenantId,
    });

    if (!result.ok) {
      return this.save(waybill.failExtraction(result.reason));
    }

    // A number read off the page may already belong to another waybill — a
    // duplicated document, or a misread digit. That is a person's call, so it
    // forces review rather than failing the job. Checked before the status is
    // decided so the whole outcome is one write.
    const candidateNumber = result.fields.waybillNumber?.value?.trim() || null;
    const clash = await this.hasNumberClash(waybill, candidateNumber);

    return this.save(
      waybill.applyExtraction({
        fields: result.fields,
        confidenceThreshold: this.config.fleet.waybillConfidenceThreshold,
        forcedReviewReason: clash
          ? `Waybill number ${candidateNumber} already belongs to another waybill.`
          : null,
      }),
    );
  }

  private async hasNumberClash(waybill: Waybill, candidate: string | null): Promise<boolean> {
    if (!candidate) return false;
    const existing = await this.waybills.findByNumber(candidate, waybill.tenantId);
    return Boolean(existing && existing.id !== waybill.id);
  }

  // Pricing follows extraction directly: a waybill the machine read cleanly
  // should reach the invoicing queue without a person touching it.
  private async save(waybill: Waybill): Promise<Waybill> {
    await this.waybills.save(waybill);
    return this.pricing.execute(waybill);
  }
}
