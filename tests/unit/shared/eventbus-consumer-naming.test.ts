import { describe, expect, it } from 'vitest';

/**
 * Mirrors the durable-name derivation in nats-jetstream.eventbus.ts. The rule it
 * protects: two subscribers to one subject must not end up on one consumer,
 * because JetStream would then hand each message to exactly one of them.
 */
function durableName(subject: string, consumer?: string): string {
  return [subject, consumer]
    .filter(Boolean)
    .join('_')
    .replace(/[.*>]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

describe('durable consumer naming', () => {
  it('gives two subscribers of one subject two different consumers', () => {
    expect(durableName('tm.*.alert.triggered', 'alert_detection')).not.toBe(
      durableName('tm.*.alert.triggered', 'audit_log'),
    );
  });

  it('keeps one subscriber on one stable name across restarts', () => {
    expect(durableName('tm.*.alert.triggered', 'audit_log')).toBe(
      durableName('tm.*.alert.triggered', 'audit_log'),
    );
  });

  it('still names a subject with no consumer given', () => {
    expect(durableName('tm.*.job.status.changed')).toBe('tm_job_status_changed');
  });

  it('produces a name JetStream accepts, with no dots or wildcards', () => {
    const name = durableName('tm.*.vehicle.geofence.exited', 'alert_detection');

    expect(name).not.toMatch(/[.*>]/);
    expect(name).toBe('tm_vehicle_geofence_exited_alert_detection');
  });

  it('collapses repeated separators rather than emitting empty segments', () => {
    expect(durableName('tm.>.thing', 'x')).toBe('tm_thing_x');
  });

  it('keeps distinct subjects distinct under one consumer name', () => {
    expect(durableName('tm.*.alert.triggered', 'audit_log')).not.toBe(
      durableName('tm.*.vehicle.geofence.exited', 'audit_log'),
    );
  });
});
