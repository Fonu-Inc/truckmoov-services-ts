import { Inject, Injectable, Logger } from "@nestjs/common";
import { ObjectStorageService } from "@shared/object-storage";
import { FLEET_RUNTIME, type FleetRuntime } from "@fleet/shared/domain/ports/fleet-runtime.port";
import { FleetRuleError } from "../../../shared/domain/errors/fleet-rule.error";
import {
  Waybill,
  hashWaybillImage,
  type WaybillSource,
} from "../../domain/entities/waybill.entity";
import {
  WAYBILL_EXTRACTION_QUEUE,
  type WaybillExtractionQueue,
} from "../../domain/ports/waybill-extraction.port";
import {
  WAYBILL_REPOSITORY,
  type WaybillRepository,
} from "../../domain/repositories/waybill.repository";

/** The formats a phone camera produces. Anything else is a mistake, not a waybill. */
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"];

export const MAX_WAYBILL_IMAGE_BYTES = 10 * 1024 * 1024;

export type CaptureWaybillCommand = {
  tenantId: string;
  source: WaybillSource;
  buffer: Buffer;
  contentType: string;
  filename: string;
  /** Resolved from the sender when the source can identify one, e.g. WhatsApp. Null when unknown. */
  driverId?: string | null;
  /** Where an invoice from this waybill goes back to. */
  replyChannel?: "whatsapp" | "email" | null;
  replyAddress?: string | null;
};

@Injectable()
export class CaptureWaybillUseCase {
  private readonly logger = new Logger(CaptureWaybillUseCase.name);

  constructor(
    @Inject(WAYBILL_REPOSITORY) private readonly waybills: WaybillRepository,
    @Inject(ObjectStorageService) private readonly storage: ObjectStorageService,
    @Inject(WAYBILL_EXTRACTION_QUEUE) private readonly extraction: WaybillExtractionQueue,
    @Inject(FLEET_RUNTIME) private readonly runtime: FleetRuntime,
  ) {}

  async execute(command: CaptureWaybillCommand): Promise<Waybill> {
    this.assertAcceptableImage(command);

    const id = this.runtime.generateId();
    // The tenant leads the key so the bytes are attributable, and so the
    // storage total can be recomputed by prefix.
    const key = `${command.tenantId}/waybills/${id}/${command.filename}`;
    const sha256 = hashWaybillImage(command.buffer);

    await this.storage.putObject({
      key,
      body: command.buffer,
      contentType: command.contentType,
    });

    const waybill = Waybill.capture({
      id,
      tenantId: command.tenantId,
      source: command.source,
      imageKey: key,
      imageSha256: sha256,
      imageBytes: command.buffer.byteLength,
      driverId: command.driverId ?? null,
      // A whatsapp capture with a sender address implies the reply channel:
      // there is no separate "how should we invoice you" question in a chat.
      replyChannel:
        command.replyChannel ?? (command.source === "whatsapp" && command.replyAddress ? "whatsapp" : null),
      replyAddress: command.replyAddress ?? null,
    });
    await this.waybills.save(waybill);

    // The row exists and the bytes are stored, so the capture has succeeded.
    // A queue that is momentarily unreachable must not lose the waybill; the
    // sweep that picks up stalled rows will find it as pending.
    try {
      await this.extraction.enqueue({
        waybillId: waybill.id,
        tenantId: waybill.tenantId,
        imageKey: key,
      });
    } catch (error) {
      this.logger.warn(
        `waybill_extraction_enqueue_failed:${waybill.id}:${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
    }

    return waybill;
  }

  private assertAcceptableImage(command: CaptureWaybillCommand): void {
    if (!command.buffer?.byteLength) {
      throw new FleetRuleError("a waybill image is required");
    }
    if (command.buffer.byteLength > MAX_WAYBILL_IMAGE_BYTES) {
      throw new FleetRuleError("a waybill image must be 10 MB or smaller");
    }
    if (!ACCEPTED_IMAGE_TYPES.includes(command.contentType)) {
      throw new FleetRuleError("a waybill image must be a JPG or PNG");
    }
  }
}
