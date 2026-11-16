import type { AppConfigService } from "@shared/config";
import { verifiedHandler, type BusHandler, type VerifiedHandlerOptions } from "@shared/eventbus";

/** Wraps bus handlers so only signed events whose subject tenant matches the envelope reach them. */
export function busVerifier(config: AppConfigService, logger: VerifiedHandlerOptions["logger"]) {
  return (handler: BusHandler): BusHandler =>
    verifiedHandler(handler, {
      secret: config.eventSigningSecret,
      acceptUnsigned: config.eventAcceptUnsigned,
      logger,
    });
}
