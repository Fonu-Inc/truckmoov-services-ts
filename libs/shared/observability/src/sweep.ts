import type { Logger } from "@nestjs/common";

/**
 * Starts a background sweep that cannot become an unhandled rejection.
 *
 * A timer callback returning a promise nobody awaits means any failure the
 * sweep does not catch itself — a database pool timeout, say — escapes as an
 * unhandled rejection, which is reported as a crash-shaped error rather than
 * the recoverable "this tick did not run" that it is. The next tick is
 * unaffected either way, so the failure is logged and swallowed here.
 */
export function sweepSafely(
  logger: Logger,
  name: string,
  run: () => Promise<unknown>,
): void {
  void run().catch((error: unknown) => {
    logger.error(`${name}_sweep_failed:${error instanceof Error ? error.message : "unknown"}`);
  });
}
