import { lagosDate } from '@shared/devices';
import { OPEN_JOB_STATUSES, START_SOURCE_STATUSES } from '@auth/installation/domain/installation-order';
import {
  CHECKLIST_ITEMS,
  INSTALLATION_CHECKLIST,
} from '@auth/installation/domain/installation-checklist';
import {
  EVIDENCE_CATEGORIES,
  evidenceFileNameOf,
} from '@auth/installation/domain/installation-evidence';
import type {
  StoredChecklistTick,
  StoredDeviceAssignment,
  StoredInstallationEvidence,
  StoredInstallationOrder,
} from '@auth/installation/domain/installation-order.repository';

export function toEvidenceView(evidence: StoredInstallationEvidence) {
  return {
    id: evidence.id,
    category: evidence.category,
    label: EVIDENCE_CATEGORIES[evidence.category] ?? evidence.category,
    fileName: evidenceFileNameOf(evidence.fileKey, evidence.id),
    size: evidence.fileSize,
    createdAt: evidence.createdAt.toISOString(),
  };
}

export function toChecklistView(ticks: StoredChecklistTick[]) {
  const byKey = new Map(ticks.map((tick) => [tick.itemKey, tick]));
  const groups = INSTALLATION_CHECKLIST.map((group) => ({
    key: group.key,
    label: group.label,
    items: group.items.map((item) => ({
      key: item.key,
      label: item.label,
      checked: byKey.has(item.key),
      checkedAt: byKey.get(item.key)?.checkedAt.toISOString() ?? null,
      ...(item.gated ? { gated: item.gated } : {}),
    })),
  }));
  const completed = CHECKLIST_ITEMS.filter((item) => byKey.has(item.key)).length;
  return { groups, completed, total: CHECKLIST_ITEMS.length };
}

export type CompletionParts = {
  order: StoredInstallationOrder;
  customer: string;
  installer: string;
  vehicles: string[];
  devices: string[];
  checklistCompleted: number;
  evidenceCount: number;
};

export function toCompletionView(parts: CompletionParts) {
  const { order } = parts;
  return {
    customer: parts.customer,
    vehicle: parts.vehicles[0] ?? null,
    device: parts.devices[0] ?? null,
    vehicles: parts.vehicles,
    devices: parts.devices,
    installationDate: order.completedAt ? lagosDate(order.completedAt) : order.scheduledDate.toISOString().slice(0, 10),
    installer: parts.installer,
    checklist: `${parts.checklistCompleted}/${CHECKLIST_ITEMS.length}`,
    evidenceCount: parts.evidenceCount,
    notes: order.installerNotes,
  };
}

export function toActionsView(order: StoredInstallationOrder, units: StoredDeviceAssignment[], checklistCompleted: number) {
  const open = OPEN_JOB_STATUSES.includes(order.status);
  const inProgress = order.status === 'in_progress';
  const allBound = units.length > 0 && units.every((unit) => unit.fleetDeviceId);
  return {
    canAccept: order.status === 'assigned',
    canStart: START_SOURCE_STATUSES.includes(order.status) && allBound,
    canComplete: inProgress && checklistCompleted === CHECKLIST_ITEMS.length,
    canEditNotes: open,
    canUploadEvidence: open,
    canTick: inProgress,
  };
}

export function installerOptions() {
  return {
    checklist: INSTALLATION_CHECKLIST,
    evidenceCategories: Object.entries(EVIDENCE_CATEGORIES).map(([key, label]) => ({ key, label })),
  };
}
