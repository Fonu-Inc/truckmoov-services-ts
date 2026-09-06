export type CoalescedPosition = {
  vehicleId: string;
  lat: number;
  lng: number;
  speedKph: number | null;
  heading: number | null;
  fixedAt: string;
};

type Frame = Map<string, CoalescedPosition>;

/**
 * Collapses a tenant's position traffic into one frame per tick.
 *
 * A fleet of five hundred vehicles reporting every ten seconds is fifty
 * messages a second, and a browser cannot repaint a map that often. Only the
 * newest fix per vehicle survives a tick, because an older one is not history
 * the map wants — it is a position the vehicle has already left.
 *
 * Holding state per tenant rather than globally keeps one busy fleet from
 * delaying a quiet one's frame.
 */
export class PositionCoalescer {
  private readonly frames = new Map<string, Frame>();

  add(tenantId: string, position: CoalescedPosition): void {
    const frame = this.frames.get(tenantId) ?? new Map<string, CoalescedPosition>();
    const existing = frame.get(position.vehicleId);

    // Fixes can arrive out of order when a device buffers offline and flushes.
    // The newest fix wins on its own timestamp, not on arrival.
    if (!existing || isNewer(position.fixedAt, existing.fixedAt)) {
      frame.set(position.vehicleId, position);
    }
    this.frames.set(tenantId, frame);
  }

  /** Empties the buffer and returns what each tenant should receive. */
  drain(): Array<{ tenantId: string; positions: CoalescedPosition[] }> {
    const drained = [...this.frames.entries()].map(([tenantId, frame]) => ({
      tenantId,
      positions: [...frame.values()],
    }));
    this.frames.clear();
    return drained;
  }

  pendingTenants(): number {
    return this.frames.size;
  }
}

function isNewer(candidate: string, current: string): boolean {
  const a = Date.parse(candidate);
  const b = Date.parse(current);
  // An unparseable timestamp must not silently win. Keep what is already held.
  if (Number.isNaN(a)) return false;
  if (Number.isNaN(b)) return true;
  return a >= b;
}

export function readPosition(payload: unknown): CoalescedPosition | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const data = payload as Record<string, unknown>;

  const vehicleId = typeof data['vehicle_id'] === 'string' ? data['vehicle_id'] : null;
  const lat = toNumber(data['lat']);
  const lng = toNumber(data['lng']);
  if (!vehicleId || lat === null || lng === null) return null;

  return {
    vehicleId,
    lat,
    lng,
    speedKph: toNumber(data['speed_kph']),
    heading: toNumber(data['heading']),
    fixedAt: typeof data['fix_time'] === 'string' ? data['fix_time'] : new Date().toISOString(),
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
