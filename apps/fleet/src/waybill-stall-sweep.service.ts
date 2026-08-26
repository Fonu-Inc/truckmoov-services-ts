import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { ExpireStalledWaybillsUseCase } from "./contexts/fleet/waybills/application/use-cases/expire-stalled-waybills.use-case";

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Finds waybills the extraction queue never picked up.
 *
 * Capture keeps the waybill even when the queue is unreachable, so a row can
 * exist with no job behind it. Without this it stays pending for ever and the
 * revenue behind it is never billed.
 */
@Injectable()
export class WaybillStallSweepService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WaybillStallSweepService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(ExpireStalledWaybillsUseCase)
    private readonly expire: ExpireStalledWaybillsUseCase,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.run(), SWEEP_INTERVAL_MS);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    try {
      await this.expire.execute();
    } catch (error) {
      this.logger.warn(
        `waybill_stall_sweep_failed:${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }
}
