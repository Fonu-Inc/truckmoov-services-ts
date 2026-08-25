/**
 * The tenant a subject belongs to, or null when it names no tenant.
 *
 * Subjects follow tm.<tenant>.<event>. The tenant slot does not always hold a
 * real tenant: platform-wide events use "system" (see the compliance reminder
 * sweep), and those must never be delivered to a tenant's room.
 */
export const SYSTEM_TENANT = 'system';

export function tenantOfSubject(subject: string): string | null {
  const parts = subject.split('.');
  if (parts.length < 3 || parts[0] !== 'tm') return null;

  const tenantId = parts[1];
  if (!tenantId || tenantId === '*' || tenantId === '>') return null;
  return tenantId;
}

/**
 * Whether a message on this subject may be delivered to this tenant's room.
 *
 * The comparison is between the tenant named in the subject and the tenant
 * claim on a token this gateway verified itself. Nothing else grants delivery:
 * the room name is derived from the verified claim, never from anything the
 * client sent.
 */
export function mayDeliver(subject: string, tenantId: string): boolean {
  const subjectTenant = tenantOfSubject(subject);
  if (!subjectTenant) return false;
  // A system event is platform-wide and belongs to no tenant's mailbox.
  if (subjectTenant === SYSTEM_TENANT) return false;
  return subjectTenant === tenantId;
}

/** The room a verified tenant listens on. Never built from client input. */
export function roomFor(tenantId: string): string {
  return `tenant:${tenantId}`;
}
