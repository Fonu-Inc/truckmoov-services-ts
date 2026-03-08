export type VehicleProps = {
  id: string;
  plateNumber: string;
  model: string;
  tenantId: string;
};

export class Vehicle {
  private constructor(private readonly props: VehicleProps) {}

  static create(props: VehicleProps): Vehicle {
    if (!props.plateNumber.trim()) {
      throw new Error("plateNumber is required");
    }
    if (!props.model.trim()) {
      throw new Error("model is required");
    }
    if (!props.tenantId.trim()) {
      throw new Error("tenantId is required");
    }

    return new Vehicle({
      ...props,
      plateNumber: props.plateNumber.trim(),
      model: props.model.trim(),
      tenantId: props.tenantId.trim(),
    });
  }

  get id() {
    return this.props.id;
  }

  get plateNumber() {
    return this.props.plateNumber;
  }

  get model() {
    return this.props.model;
  }

  get tenantId() {
    return this.props.tenantId;
  }

  update(values: {
    plateNumber?: string;
    model?: string;
    tenantId?: string;
  }): Vehicle {
    return Vehicle.create({
      id: this.id,
      plateNumber: values.plateNumber ?? this.plateNumber,
      model: values.model ?? this.model,
      tenantId: values.tenantId ?? this.tenantId,
    });
  }

  toPrimitives(): VehicleProps {
    return {
      id: this.id,
      plateNumber: this.plateNumber,
      model: this.model,
      tenantId: this.tenantId,
    };
  }
}
