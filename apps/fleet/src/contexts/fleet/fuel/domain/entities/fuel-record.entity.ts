export type AuditEntry = {
  at: string;
  by: string;
  action: "create" | "edit" | "delete";
};

export type FuelRecordProps = {
  id: string;
  tenantId: string;
  vehicleId: string;
  driverId: string | null;
  vehicleType: string | null;
  liters: number;
  pricePerLiter: number;
  totalCost: number;
  station: string | null;
  odometer: number | null;
  recordedAt: string;
  recordedBy: string;
  deletedAt: string | null;
  auditTrail: AuditEntry[];
};

export class FuelRecord {
  private constructor(private readonly props: FuelRecordProps) {}

  static create(props: Omit<FuelRecordProps, "totalCost"> & { totalCost?: number }): FuelRecord {
    if (!props.id?.trim()) throw new Error("id is required");
    if (!props.tenantId?.trim()) throw new Error("tenantId is required");
    if (!props.vehicleId?.trim()) throw new Error("vehicleId is required");
    if (props.liters <= 0) throw new Error("liters must be positive");
    if (props.pricePerLiter < 0) throw new Error("pricePerLiter must be non-negative");

    return new FuelRecord({
      ...props,
      totalCost: props.totalCost ?? +(props.liters * props.pricePerLiter).toFixed(2),
      auditTrail: props.auditTrail ?? [],
      deletedAt: props.deletedAt ?? null,
    });
  }

  get id() { return this.props.id; }
  get tenantId() { return this.props.tenantId; }
  get vehicleId() { return this.props.vehicleId; }
  get driverId() { return this.props.driverId; }
  get vehicleType() { return this.props.vehicleType; }
  get liters() { return this.props.liters; }
  get pricePerLiter() { return this.props.pricePerLiter; }
  get totalCost() { return this.props.totalCost; }
  get station() { return this.props.station; }
  get odometer() { return this.props.odometer; }
  get recordedAt() { return this.props.recordedAt; }
  get recordedBy() { return this.props.recordedBy; }
  get deletedAt() { return this.props.deletedAt; }
  get auditTrail() { return [...this.props.auditTrail]; }
  get isDeleted() { return this.props.deletedAt !== null; }

  update(
    changes: Partial<Pick<FuelRecordProps, "liters" | "pricePerLiter" | "station" | "odometer" | "driverId" | "vehicleType">>,
    by: string,
  ): FuelRecord {
    const liters = changes.liters ?? this.props.liters;
    const pricePerLiter = changes.pricePerLiter ?? this.props.pricePerLiter;
    return FuelRecord.create({
      ...this.props,
      ...changes,
      liters,
      pricePerLiter,
      totalCost: +(liters * pricePerLiter).toFixed(2),
      auditTrail: [...this.props.auditTrail, { at: new Date().toISOString(), by, action: "edit" }],
    });
  }

  softDelete(by: string): FuelRecord {
    return FuelRecord.create({
      ...this.props,
      deletedAt: new Date().toISOString(),
      auditTrail: [...this.props.auditTrail, { at: new Date().toISOString(), by, action: "delete" }],
    });
  }

  toPrimitives(): FuelRecordProps {
    return { ...this.props, auditTrail: this.auditTrail };
  }
}
