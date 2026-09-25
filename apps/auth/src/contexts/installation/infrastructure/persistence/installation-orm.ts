import { EntitySchema } from '@mikro-orm/core';

/* ── Installers ─────────────────────────────────────── */

export class InstallerRecord {
  id!: string;
  userId!: string | null;
  code!: string;
  firstName!: string;
  lastName!: string;
  fullName!: string;
  email!: string;
  phoneNumber!: string;
  team!: string;
  state!: string | null;
  city!: string | null;
  serviceAreas!: string[];
  capabilities!: string[];
  photoKey!: string | null;
  notificationPreferences!: Record<string, boolean> | null;
  displayPreferences!: Record<string, unknown> | null;
  workPreferences!: Record<string, unknown> | null;
  status!: string;
  maxActiveJobs!: number;
  lastActivityAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const InstallerRecordSchema = new EntitySchema<InstallerRecord>({
  class: InstallerRecord,
  tableName: 'installers',
  properties: {
    id: { type: 'string', primary: true },
    userId: { fieldName: 'user_id', type: 'string', length: 64, nullable: true, unique: true },
    code: { type: 'string', length: 16, unique: true },
    firstName: { fieldName: 'first_name', type: 'string', length: 60 },
    lastName: { fieldName: 'last_name', type: 'string', length: 60 },
    fullName: { fieldName: 'full_name', type: 'string', length: 120 },
    email: { type: 'string', length: 254, unique: true },
    phoneNumber: { fieldName: 'phone_number', type: 'string', length: 20 },
    team: { type: 'string', length: 120, default: '' },
    state: { type: 'string', length: 64, nullable: true, index: true },
    city: { type: 'string', length: 80, nullable: true },
    serviceAreas: { fieldName: 'service_areas', type: 'string[]', defaultRaw: "'{}'" },
    capabilities: { type: 'string[]', defaultRaw: "'{}'" },
    photoKey: { fieldName: 'photo_key', type: 'string', length: 512, nullable: true },
    notificationPreferences: { fieldName: 'notification_preferences', type: 'json', nullable: true },
    displayPreferences: { fieldName: 'display_preferences', type: 'json', nullable: true },
    workPreferences: { fieldName: 'work_preferences', type: 'json', nullable: true },
    status: { type: 'string', length: 16, default: 'invited', index: true },
    maxActiveJobs: { fieldName: 'max_active_jobs', type: 'number', default: 3 },
    lastActivityAt: { fieldName: 'last_activity_at', type: 'datetime', nullable: true },
    createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
    updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
  },
});

/* ── Installation Orders ────────────────────────────── */

export class InstallationOrderRecord {
  id!: string;
  orderNumber!: string;
  applicationId!: string;
  tenantId!: string;
  scheduledDate!: Date;
  timeSlot!: string;
  addressLine!: string;
  city!: string;
  state!: string;
  siteContactName!: string;
  siteContactPhone!: string;
  notes!: string | null;
  installerNotes!: string | null;
  installerId!: string | null;
  status!: string;
  preExceptionStatus!: string | null;
  assignedAt!: Date | null;
  acceptedAt!: Date | null;
  startedAt!: Date | null;
  issueReportedAt!: Date | null;
  completedAt!: Date | null;
  cancelledAt!: Date | null;
  reminderSentAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const InstallationOrderRecordSchema =
  new EntitySchema<InstallationOrderRecord>({
    class: InstallationOrderRecord,
    tableName: 'installation_orders',
    properties: {
      id: { type: 'string', primary: true },
      orderNumber: { fieldName: 'order_number', type: 'string', length: 32, unique: true },
      applicationId: { fieldName: 'application_id', type: 'string', length: 64, unique: true },
      tenantId: { fieldName: 'tenant_id', type: 'string', length: 64, index: true },
      scheduledDate: { fieldName: 'scheduled_date', type: 'datetime' },
      timeSlot: { fieldName: 'time_slot', type: 'string', length: 16 },
      addressLine: { fieldName: 'address_line', type: 'string', length: 200 },
      city: { type: 'string', length: 80 },
      state: { type: 'string', length: 64 },
      siteContactName: { fieldName: 'site_contact_name', type: 'string', length: 80 },
      siteContactPhone: { fieldName: 'site_contact_phone', type: 'string', length: 20 },
      notes: { type: 'text', nullable: true },
      installerNotes: { fieldName: 'installer_notes', type: 'text', nullable: true },
      installerId: { fieldName: 'installer_id', type: 'string', length: 64, nullable: true, index: true },
      status: { type: 'string', length: 24, default: 'unassigned', index: true },
      preExceptionStatus: { fieldName: 'pre_exception_status', type: 'string', length: 24, nullable: true },
      assignedAt: { fieldName: 'assigned_at', type: 'datetime', nullable: true },
      acceptedAt: { fieldName: 'accepted_at', type: 'datetime', nullable: true },
      startedAt: { fieldName: 'started_at', type: 'datetime', nullable: true },
      issueReportedAt: { fieldName: 'issue_reported_at', type: 'datetime', nullable: true },
      completedAt: { fieldName: 'completed_at', type: 'datetime', nullable: true },
      cancelledAt: { fieldName: 'cancelled_at', type: 'datetime', nullable: true },
      reminderSentAt: { fieldName: 'reminder_sent_at', type: 'datetime', nullable: true },
      createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
      updatedAt: { fieldName: 'updated_at', type: 'datetime', onUpdate: () => new Date(), defaultRaw: 'now()' },
    },
  });

export class InstallationDeviceAssignmentRecord {
  id!: string;
  orderId!: string;
  deviceIndex!: number;
  vehicleId!: string;
  fleetDeviceId!: string | null;
  createdAt!: Date;
}

export const InstallationDeviceAssignmentRecordSchema =
  new EntitySchema<InstallationDeviceAssignmentRecord>({
    class: InstallationDeviceAssignmentRecord,
    tableName: 'installation_device_assignments',
    properties: {
      id: { type: 'string', primary: true },
      orderId: { fieldName: 'order_id', type: 'string', length: 64, index: true },
      deviceIndex: { fieldName: 'device_index', type: 'number' },
      vehicleId: { fieldName: 'vehicle_id', type: 'string', length: 64 },
      fleetDeviceId: { fieldName: 'fleet_device_id', type: 'string', length: 64, nullable: true },
      createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
    },
  });

export class InstallationChecklistTickRecord {
  orderId!: string;
  itemKey!: string;
  checkedAt!: Date;
  checkedBy!: string;
}

export const InstallationChecklistTickRecordSchema =
  new EntitySchema<InstallationChecklistTickRecord>({
    class: InstallationChecklistTickRecord,
    tableName: 'installation_checklist_ticks',
    properties: {
      orderId: { fieldName: 'order_id', type: 'string', length: 64, primary: true },
      itemKey: { fieldName: 'item_key', type: 'string', length: 64, primary: true },
      checkedAt: { fieldName: 'checked_at', type: 'datetime' },
      checkedBy: { fieldName: 'checked_by', type: 'string', length: 64 },
    },
  });

export class InstallationEvidenceRecord {
  id!: string;
  orderId!: string;
  category!: string;
  fileKey!: string;
  fileHash!: string;
  fileSize!: number;
  mimeType!: string;
  uploadedBy!: string;
  createdAt!: Date;
}

export const InstallationEvidenceRecordSchema =
  new EntitySchema<InstallationEvidenceRecord>({
    class: InstallationEvidenceRecord,
    tableName: 'installation_evidence',
    properties: {
      id: { type: 'string', length: 64, primary: true },
      orderId: { fieldName: 'order_id', type: 'string', length: 64, index: true },
      category: { type: 'string', length: 32 },
      fileKey: { fieldName: 'file_key', type: 'string', length: 512 },
      fileHash: { fieldName: 'file_hash', type: 'string', length: 64 },
      fileSize: { fieldName: 'file_size', type: 'number' },
      mimeType: { fieldName: 'mime_type', type: 'string', length: 32 },
      uploadedBy: { fieldName: 'uploaded_by', type: 'string', length: 64 },
      createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
    },
  });

export class InstallationOfferRejectionRecord {
  orderId!: string;
  installerId!: string;
  reason!: string;
  rejectedAt!: Date;
}

export const InstallationOfferRejectionRecordSchema =
  new EntitySchema<InstallationOfferRejectionRecord>({
    class: InstallationOfferRejectionRecord,
    tableName: 'installation_offer_rejections',
    properties: {
      orderId: { fieldName: 'order_id', type: 'string', length: 64, primary: true },
      installerId: { fieldName: 'installer_id', type: 'string', length: 64, primary: true },
      reason: { type: 'string', length: 500 },
      rejectedAt: { fieldName: 'rejected_at', type: 'datetime', defaultRaw: 'now()' },
    },
  });

export class InstallerNotificationRecord {
  id!: string;
  installerId!: string;
  type!: string;
  title!: string;
  body!: string;
  orderId!: string | null;
  dedupeKey!: string;
  createdAt!: Date;
  readAt!: Date | null;
}

export const InstallerNotificationRecordSchema =
  new EntitySchema<InstallerNotificationRecord>({
    class: InstallerNotificationRecord,
    tableName: 'installer_notifications',
    properties: {
      id: { type: 'string', length: 64, primary: true },
      installerId: { fieldName: 'installer_id', type: 'string', length: 64 },
      type: { type: 'string', length: 40 },
      title: { type: 'string', length: 120 },
      body: { type: 'text' },
      orderId: { fieldName: 'order_id', type: 'string', length: 64, nullable: true },
      dedupeKey: { fieldName: 'dedupe_key', type: 'string', length: 200, unique: true },
      createdAt: { fieldName: 'created_at', type: 'datetime', defaultRaw: 'now()' },
      readAt: { fieldName: 'read_at', type: 'datetime', nullable: true },
    },
  });
