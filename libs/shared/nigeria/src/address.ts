import { BadRequestException } from '@nestjs/common';
import {
  canonicalLga,
  isInsideNigeria,
  mentionsForeignPlace,
  mentionsNigerianPlace,
  normalizeCountry,
  normalizeNigerianState,
} from './nigeria';

export class NigerianAddressError extends BadRequestException {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super({ message, field });
  }
}

// Free-text cities like "Lekki Phase 1" or "Ikeja, Lagos"; angle brackets and control characters fall outside it.
const CITY_PATTERN = /^[\p{L}\p{N}\s,.'’()&/-]+$/u;

export const squash = (raw: unknown): string => String(raw ?? '').replace(/\s+/g, ' ').trim();

export function requireState(raw: unknown, field = 'state'): string {
  const state = normalizeNigerianState(raw);
  if (!state) throw new NigerianAddressError(field, 'State must be a Nigerian state or FCT');
  return state;
}

/** With `lga` the city must be a local government area of the state, otherwise it is a free-text place name. */
export function requireCity(raw: unknown, state: string | null, lga: boolean, field = 'city'): string {
  const city = squash(raw);
  if (city.length < 2 || city.length > 80) {
    throw new NigerianAddressError(field, 'City must be between 2 and 80 characters');
  }
  if (lga) {
    // Some area names contain "/", so the free-text pattern must not run first.
    const match = state ? canonicalLga(state, city) : null;
    if (!match) throw new NigerianAddressError(field, 'City must be a local government area of the selected state');
    return match;
  }
  if (!/\p{L}/u.test(city) || !CITY_PATTERN.test(city)) {
    throw new NigerianAddressError(field, 'City must be a place name');
  }
  return city;
}

export function requireAddressLine(raw: unknown, field = 'addressLine'): string {
  const line = squash(raw);
  if (line.length < 3 || line.length > 200) {
    throw new NigerianAddressError(field, 'Address must be between 3 and 200 characters');
  }
  if (!/\p{L}/u.test(line)) throw new NigerianAddressError(field, 'Address must contain letters');
  return line;
}

/** Blank means not supplied; anything else must be a real address line, unless it is the stored value echoed back. */
export function optionalAddressLine(raw: unknown, field = 'address', stored?: string | null): string | null {
  const line = squash(raw);
  if (line === '') return null;
  if (stored && line === squash(stored)) return stored;
  return requireAddressLine(line, field);
}

/** A whole address in one line: a Nigerian place passes, a clearly foreign one is refused, and an unknown local area (Lekki, Wuse) passes. The stored value echoed back is kept. */
export function optionalFullAddressLine(raw: unknown, field = 'address', stored?: string | null): string | null {
  const line = optionalAddressLine(raw, field, stored);
  if (line === null || (stored && line === stored)) return line;
  if (!mentionsNigerianPlace(line) && mentionsForeignPlace(line)) {
    throw new NigerianAddressError(field, 'Address must be in Nigeria, for example "12 Marina Road, Lagos Island, Lagos"');
  }
  return line;
}

/** A flat, unit or landmark line, so "2B" or "12" is fine. */
export function optionalAddressLine2(raw: unknown, field = 'addressLine2', stored?: string | null): string | null {
  const line = squash(raw);
  if (line === '') return null;
  if (stored && line === squash(stored)) return stored;
  if (line.length > 200 || /\p{Cc}/u.test(line)) {
    throw new NigerianAddressError(field, 'Address line must be at most 200 characters without control characters');
  }
  return line;
}

export function requireCountry(raw: unknown, field = 'country'): 'Nigeria' {
  const country = normalizeCountry(raw);
  if (!country) throw new NigerianAddressError(field, 'Country must be Nigeria');
  return country;
}

/** Both or neither, and inside Nigeria. Null when neither was supplied. */
export function requireCoordinates(
  latitude: unknown,
  longitude: unknown,
  fields: [string, string] = ['addressLatitude', 'addressLongitude'],
): { latitude: number; longitude: number } | null {
  const absent = (value: unknown) => value === undefined || value === null;
  if (absent(latitude) && absent(longitude)) return null;
  if (absent(latitude) || absent(longitude)) {
    throw new NigerianAddressError(fields[absent(latitude) ? 0 : 1], 'Latitude and longitude must be given together');
  }
  if (!isInsideNigeria(latitude, longitude)) {
    throw new NigerianAddressError(fields[0], 'Coordinates must be inside Nigeria');
  }
  return { latitude: latitude as number, longitude: longitude as number };
}
