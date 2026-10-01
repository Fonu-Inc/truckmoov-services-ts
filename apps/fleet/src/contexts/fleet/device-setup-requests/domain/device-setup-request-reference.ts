import { randomInt } from "node:crypto";

const PREFIX = "DVR-";
const MIN = 100000;
const MAX = 1000000;
const ATTEMPTS = 5;

export const SETUP_REQUEST_REFERENCE_PATTERN = /^DVR-\d{6}$/;

export function formatSetupRequestReference(n: number): string {
  return `${PREFIX}${n}`;
}

/**
 * Random rather than sequential so a reference does not reveal request volume.
 * Unique across tenants: the platform queue searches every tenant at once.
 */
export async function nextSetupRequestReference(
  taken: (reference: string) => Promise<boolean>,
  draw: () => number = () => randomInt(MIN, MAX),
): Promise<string> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const reference = formatSetupRequestReference(draw());
    if (!(await taken(reference))) return reference;
  }
  throw new Error("could not allocate a device request reference");
}
