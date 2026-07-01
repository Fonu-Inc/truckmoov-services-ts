import type { Carrier, DataBundle } from "../../domain/entities/carrier.entity";

export const SEED_CARRIERS: Carrier[] = [
  { id: "carrier-mtn", name: "MTN", code: "mtn", status: "active" },
  { id: "carrier-airtel", name: "Airtel", code: "airtel", status: "active" },
  { id: "carrier-glo", name: "Glo", code: "glo", status: "active" },
  { id: "carrier-9mobile", name: "9mobile", code: "9mobile", status: "active" },
];

export const SEED_DATA_BUNDLES: DataBundle[] = [
  { id: "bundle-mtn-monthly-1gb", carrierId: "carrier-mtn", name: "MTN 1GB Monthly", planType: "monthly", dataAllowanceMb: 1024, priceNgn: 1000, status: "active" },
  { id: "bundle-mtn-monthly-2gb", carrierId: "carrier-mtn", name: "MTN 2GB Monthly", planType: "monthly", dataAllowanceMb: 2048, priceNgn: 1800, status: "active" },
  { id: "bundle-airtel-monthly-1gb", carrierId: "carrier-airtel", name: "Airtel 1GB Monthly", planType: "monthly", dataAllowanceMb: 1024, priceNgn: 1000, status: "active" },
  { id: "bundle-airtel-monthly-2gb", carrierId: "carrier-airtel", name: "Airtel 2GB Monthly", planType: "monthly", dataAllowanceMb: 2048, priceNgn: 1800, status: "active" },
  { id: "bundle-glo-monthly-1gb", carrierId: "carrier-glo", name: "Glo 1GB Monthly", planType: "monthly", dataAllowanceMb: 1024, priceNgn: 900, status: "active" },
  { id: "bundle-9mobile-monthly-1gb", carrierId: "carrier-9mobile", name: "9mobile 1GB Monthly", planType: "monthly", dataAllowanceMb: 1024, priceNgn: 950, status: "active" },
];
