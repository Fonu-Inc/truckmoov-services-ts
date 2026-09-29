import { Logger } from "@nestjs/common";

const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
]);

/** Postgres "shutting down", "starting up" and the whole connection-exception class. */
const TRANSIENT_PG_CODES = /^(57P0[1-3]|08\w{3})$/;

export interface ConnectRetryOptions {
  label: string;
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

const logger = new Logger("DbConnect");

function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

/**
 * The database being away, as opposed to the database saying no. A restart or
 * rollout resolves the first on its own; retrying the second only delays the
 * failure that a bad password or a broken migration should raise at once.
 */
export function isTransientDbError(error: unknown): boolean {
  const code = errorCode(error);
  if (code && (TRANSIENT_NETWORK_CODES.has(code) || TRANSIENT_PG_CODES.test(code))) {
    return true;
  }
  const name = (error as { name?: unknown } | null)?.name;
  const message = error instanceof Error ? error.message : "";
  return name === "KnexTimeoutError" || /connection terminated|ECONNRESET|ECONNREFUSED/i.test(message);
}

function delayFor(attempt: number, baseDelayMs: number, maxDelayMs: number) {
  return Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs a DB start-up step, retrying with exponential backoff while the database
 * is unreachable. Gives up after `attempts` and rethrows the last error so the
 * orchestrator's restart is still the backstop.
 */
export async function retryDbConnect<T>(
  operation: () => Promise<T>,
  { label, attempts = 8, baseDelayMs = 1_000, maxDelayMs = 15_000 }: ConnectRetryOptions,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts || !isTransientDbError(error)) {
        throw error;
      }
      const delayMs = delayFor(attempt, baseDelayMs, maxDelayMs);
      logger.warn(`${label}: database unavailable, attempt ${attempt}/${attempts}, retrying in ${delayMs}ms`);
      await sleep(delayMs);
    }
  }
}
