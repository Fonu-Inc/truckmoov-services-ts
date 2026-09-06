import { describe, expect, it } from "vitest";
import {
  PositionCoalescer,
  readPosition,
} from "../../../apps/realtime/src/position-coalescer";

function fix(vehicleId: string, fixedAt: string, lat = 6.5) {
  return { vehicleId, lat, lng: 3.3, speedKph: 40, heading: 90, fixedAt };
}

describe("Position coalescing", () => {
  it("keeps only the newest fix per vehicle in a frame", () => {
    const coalescer = new PositionCoalescer();
    coalescer.add("tenant-a", fix("v1", "2026-09-07T10:00:00.000Z", 6.1));
    coalescer.add("tenant-a", fix("v1", "2026-09-07T10:00:04.000Z", 6.9));

    const [frame] = coalescer.drain();
    expect(frame.positions).toHaveLength(1);
    expect(frame.positions[0].lat).toBe(6.9);
  });

  // A device that buffers while offline flushes its backlog on reconnect, so
  // an older fix can arrive after a newer one. Arrival order is not truth.
  it("does not let a late-arriving older fix overwrite a newer one", () => {
    const coalescer = new PositionCoalescer();
    coalescer.add("tenant-a", fix("v1", "2026-09-07T10:00:10.000Z", 6.9));
    coalescer.add("tenant-a", fix("v1", "2026-09-07T10:00:02.000Z", 6.1));

    expect(coalescer.drain()[0].positions[0].lat).toBe(6.9);
  });

  it("keeps tenants apart", () => {
    const coalescer = new PositionCoalescer();
    coalescer.add("tenant-a", fix("v1", "2026-09-07T10:00:00.000Z"));
    coalescer.add("tenant-b", fix("v2", "2026-09-07T10:00:00.000Z"));

    const frames = coalescer.drain();
    expect(frames).toHaveLength(2);
    expect(frames.every((frame) => frame.positions.length === 1)).toBe(true);
  });

  it("empties on drain so a tick never resends the last frame", () => {
    const coalescer = new PositionCoalescer();
    coalescer.add("tenant-a", fix("v1", "2026-09-07T10:00:00.000Z"));

    expect(coalescer.drain()).toHaveLength(1);
    expect(coalescer.drain()).toHaveLength(0);
    expect(coalescer.pendingTenants()).toBe(0);
  });
});

describe("Reading a position off the bus", () => {
  it("reads the location event payload", () => {
    const position = readPosition({
      vehicle_id: "v1",
      lat: 6.5244,
      lng: 3.3792,
      speed_kph: 45,
      heading: 180,
      fix_time: "2026-09-07T10:00:00.000Z",
    });

    expect(position).toEqual({
      vehicleId: "v1",
      lat: 6.5244,
      lng: 3.3792,
      speedKph: 45,
      heading: 180,
      fixedAt: "2026-09-07T10:00:00.000Z",
    });
  });

  // A fix with no coordinates cannot be drawn, so it is dropped at the bridge
  // rather than sent for every browser to filter out.
  it("rejects a payload that cannot be plotted", () => {
    expect(readPosition({ vehicle_id: "v1", lng: 3.3 })).toBeNull();
    expect(readPosition({ lat: 6.5, lng: 3.3 })).toBeNull();
    expect(readPosition(null)).toBeNull();
  });

  it("reads coordinates that arrive as strings", () => {
    expect(readPosition({ vehicle_id: "v1", lat: "6.5", lng: "3.3" })).toMatchObject({
      lat: 6.5,
      lng: 3.3,
    });
  });

  it("falls back to now when the device sends no fix time", () => {
    const position = readPosition({ vehicle_id: "v1", lat: 6.5, lng: 3.3 });
    expect(Number.isNaN(Date.parse(position!.fixedAt))).toBe(false);
  });
});
