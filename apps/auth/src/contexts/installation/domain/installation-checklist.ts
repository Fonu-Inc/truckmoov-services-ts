export type ChecklistGate = 'device_communicating' | 'evidence';

export type ChecklistItem = { key: string; label: string; gated?: ChecklistGate };
export type ChecklistGroup = { key: string; label: string; items: readonly ChecklistItem[] };

export const INSTALLATION_CHECKLIST: readonly ChecklistGroup[] = [
  {
    key: 'before_installation',
    label: 'Before Installation',
    items: [
      { key: 'confirm_customer_vehicle_details', label: 'Confirm customer and vehicle details' },
      { key: 'confirm_vehicle_available', label: 'Confirm vehicle is available' },
      { key: 'confirm_device_details', label: 'Confirm device details' },
      { key: 'confirm_installation_equipment', label: 'Confirm required installation equipment' },
      { key: 'confirm_installation_location', label: 'Confirm installation location' },
    ],
  },
  {
    key: 'installation',
    label: 'Installation',
    items: [
      { key: 'install_device', label: 'Install device' },
      { key: 'connect_device', label: 'Connect device correctly' },
      { key: 'connect_sim', label: 'Install / connect SIM where applicable' },
      { key: 'verify_device_power', label: 'Verify device power' },
      { key: 'verify_device_communication', label: 'Verify device communication' },
      { key: 'perform_installation_checks', label: 'Perform required installation checks' },
    ],
  },
  {
    key: 'verification',
    label: 'Verification',
    items: [
      { key: 'confirm_device_communicating', label: 'Confirm device is communicating', gated: 'device_communicating' },
      { key: 'confirm_device_information', label: 'Confirm device information matches job' },
      { key: 'confirm_installation_complete', label: 'Confirm installation is complete' },
      { key: 'capture_installation_evidence', label: 'Capture installation evidence', gated: 'evidence' },
    ],
  },
];

export const CHECKLIST_ITEMS: readonly ChecklistItem[] = INSTALLATION_CHECKLIST.flatMap((group) => group.items);

export const CHECKLIST_GATES: readonly ChecklistGate[] = ['device_communicating', 'evidence'];

export function checklistItem(key: string): ChecklistItem | undefined {
  return CHECKLIST_ITEMS.find((item) => item.key === key);
}

export function isChecklistComplete(tickedKeys: Iterable<string>): boolean {
  const ticked = new Set(tickedKeys);
  return CHECKLIST_ITEMS.every((item) => ticked.has(item.key));
}
