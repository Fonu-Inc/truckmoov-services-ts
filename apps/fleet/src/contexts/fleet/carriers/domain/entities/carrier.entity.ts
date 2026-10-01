export type Carrier = {
  id: string;
  name: string;
  code: string;
  status: string;
};

export type DataBundle = {
  id: string;
  carrierId: string;
  name: string;
  planType: string;
  dataAllowanceMb: number | null;
  priceNgn: number;
  status: string;
};

export type BundleCatalog = {
  carriers: Carrier[];
  bundles: DataBundle[];
};
