/**
 * What a device request costs, priced once at approval and stored so a later
 * price change never rewrites what the tenant was quoted. Kobo integers.
 */
export const SETUP_REQUEST_CHARGE_KINDS = ["licence", "installation"] as const;
export type SetupRequestChargeKind = (typeof SETUP_REQUEST_CHARGE_KINDS)[number];

export type SetupRequestChargeLine = {
  kind: SetupRequestChargeKind;
  quantity: number;
  unitPriceKobo: number;
  amountKobo: number;
};

export type DeviceSetupRequestCharges = {
  currency: "NGN";
  planCode: string;
  planName: string;
  lines: SetupRequestChargeLine[];
  totalKobo: number;
};

export type SetupRequestChargesInput = {
  planCode: string;
  planName: string;
  quantity: number;
  licencePerDeviceKobo: number;
  installationPerDeviceKobo: number;
};

function line(kind: SetupRequestChargeKind, quantity: number, unitPriceKobo: number): SetupRequestChargeLine {
  return { kind, quantity, unitPriceKobo, amountKobo: quantity * unitPriceKobo };
}

export function buildSetupRequestCharges(input: SetupRequestChargesInput): DeviceSetupRequestCharges {
  const lines = [
    line("licence", input.quantity, input.licencePerDeviceKobo),
    line("installation", input.quantity, input.installationPerDeviceKobo),
  ];
  return {
    currency: "NGN",
    planCode: input.planCode,
    planName: input.planName,
    lines,
    totalKobo: lines.reduce((sum, l) => sum + l.amountKobo, 0),
  };
}

/** The stored column, whichever way the driver hands jsonb back. */
export function readSetupRequestCharges(raw: unknown): DeviceSetupRequestCharges | null {
  const value = typeof raw === "string" ? safeParse(raw) : raw;
  if (!value || typeof value !== "object" || !Array.isArray((value as DeviceSetupRequestCharges).lines)) return null;
  return value as DeviceSetupRequestCharges;
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const koboToNgn = (kobo: number) => Number((kobo / 100).toFixed(2));

/** Responses speak naira, like the onboarding order and quotation views. */
export function setupRequestChargesView(charges: DeviceSetupRequestCharges | null | undefined) {
  if (!charges) return null;
  return {
    currency: charges.currency,
    planCode: charges.planCode,
    planName: charges.planName,
    lines: charges.lines.map((l) => ({
      kind: l.kind,
      quantity: l.quantity,
      unitPriceNgn: koboToNgn(l.unitPriceKobo),
      amountNgn: koboToNgn(l.amountKobo),
    })),
    totalNgn: koboToNgn(charges.totalKobo),
  };
}

export type DeviceSetupRequestChargesView = NonNullable<ReturnType<typeof setupRequestChargesView>>;
