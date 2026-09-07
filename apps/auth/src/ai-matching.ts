import { maskDriverName } from './ai-redaction';
import type { AiDataProtection } from './ai-governance.repository';

/** What the platform asks a model to match against. */
export type MatchCandidate = {
  vehicleId: string;
  registrationNumber: string;
  make: string | null;
  model: string | null;
  capacity: number | null;
  capacityUnit: string | null;
  driverId: string | null;
  driverName: string | null;
  currentRegion: string | null;
  status: string;
};

export type MatchLoad = {
  jobReference: string;
  pickupAddress: string;
  dropoffAddress: string;
  weightKg: number | null;
  requiredVehicleType: string | null;
  deadline: string | null;
};

export type MatchSuggestion = {
  vehicleId: string;
  driverId: string | null;
  score: number;
  reason: string;
};

export const MATCHING_FEATURE = 'load_vehicle_driver_matching';

export const MATCHING_SYSTEM_PROMPT = [
  'You match a freight load to one of a fleet of vehicles and their drivers.',
  'You will be given a load and a numbered list of candidate vehicles.',
  'Reply with JSON only: {"suggestions":[{"candidate":<number>,"score":<0-100>,"reason":"<one sentence>"}]}',
  'Rank at most three candidates, best first. Score is your confidence that the candidate can carry this load on time.',
  'Never invent a candidate number that was not given to you. If none are suitable, reply with an empty suggestions array.',
].join(' ');

/**
 * Builds the prompt from candidates the platform has already narrowed.
 *
 * Candidates are numbered rather than identified: the model is given an index
 * and hands one back, so a hallucinated identifier cannot become a real
 * assignment. The mapping from index to vehicle stays on this side.
 */
export function buildMatchingPrompt(
  load: MatchLoad,
  candidates: MatchCandidate[],
  protection: AiDataProtection,
): string {
  const lines = [
    'Load:',
    `  Reference: ${load.jobReference}`,
    `  Pickup: ${load.pickupAddress}`,
    `  Dropoff: ${load.dropoffAddress}`,
    `  Weight: ${load.weightKg === null ? 'unspecified' : `${load.weightKg} kg`}`,
    `  Required vehicle type: ${load.requiredVehicleType ?? 'any'}`,
    `  Deadline: ${load.deadline ?? 'none'}`,
    '',
    'Candidates:',
  ];

  candidates.forEach((candidate, index) => {
    const driver = candidate.driverName
      ? protection.redactDriverNames
        ? maskDriverName(candidate.driverName)
        : candidate.driverName
      : 'unassigned';
    const capacity =
      candidate.capacity === null
        ? 'unknown capacity'
        : `${candidate.capacity} ${candidate.capacityUnit ?? 'tons'}`;

    lines.push(
      `  ${index + 1}. ${candidate.make ?? 'unknown'} ${candidate.model ?? ''}`.trimEnd()
        + ` — ${capacity}, driver ${driver}, region ${candidate.currentRegion ?? 'unknown'},`
        + ` status ${candidate.status}`,
    );
  });

  return lines.join('\n');
}

/**
 * Reads the model's answer back into vehicle ids.
 *
 * Anything the model returns that does not resolve to a candidate it was given
 * is dropped rather than repaired. A suggestion is a recommendation a
 * dispatcher acts on, so a fabricated one is worse than a missing one.
 */
export function parseMatchingResponse(
  content: string,
  candidates: MatchCandidate[],
): MatchSuggestion[] {
  const parsed = extractJson(content);
  if (!parsed) return [];

  const raw = Array.isArray(parsed['suggestions']) ? parsed['suggestions'] : [];
  const suggestions: MatchSuggestion[] = [];
  const seen = new Set<number>();

  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;

    const index = Number(record['candidate']);
    if (!Number.isInteger(index) || index < 1 || index > candidates.length) continue;
    // A model that names the same candidate twice would otherwise produce two
    // rows for one vehicle.
    if (seen.has(index)) continue;
    seen.add(index);

    const candidate = candidates[index - 1];
    suggestions.push({
      vehicleId: candidate.vehicleId,
      driverId: candidate.driverId,
      score: clampScore(record['score']),
      reason: typeof record['reason'] === 'string' ? record['reason'].trim() : '',
    });
  }

  return suggestions.sort((a, b) => b.score - a.score).slice(0, 3);
}

function clampScore(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

/**
 * Models wrap JSON in prose or a fenced block however they are asked not to,
 * so the first balanced object is taken rather than the whole reply parsed.
 */
function extractJson(content: string): Record<string, unknown> | null {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(content.slice(start, end + 1));
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
