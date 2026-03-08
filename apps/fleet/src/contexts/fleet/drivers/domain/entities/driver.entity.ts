export type DriverProps = {
  id: string;
  name: string;
  licenseNumber: string;
  tenantId: string;
};

export class Driver {
  private constructor(private readonly props: DriverProps) {}

  static create(props: DriverProps): Driver {
    if (!props.name.trim()) {
      throw new Error("name is required");
    }
    if (!props.licenseNumber.trim()) {
      throw new Error("licenseNumber is required");
    }
    if (!props.tenantId.trim()) {
      throw new Error("tenantId is required");
    }

    return new Driver({
      ...props,
      name: props.name.trim(),
      licenseNumber: props.licenseNumber.trim(),
      tenantId: props.tenantId.trim(),
    });
  }

  get id() {
    return this.props.id;
  }

  get name() {
    return this.props.name;
  }

  get licenseNumber() {
    return this.props.licenseNumber;
  }

  get tenantId() {
    return this.props.tenantId;
  }

  update(values: {
    name?: string;
    licenseNumber?: string;
    tenantId?: string;
  }): Driver {
    return Driver.create({
      id: this.id,
      name: values.name ?? this.name,
      licenseNumber: values.licenseNumber ?? this.licenseNumber,
      tenantId: values.tenantId ?? this.tenantId,
    });
  }

  toPrimitives(): DriverProps {
    return {
      id: this.id,
      name: this.name,
      licenseNumber: this.licenseNumber,
      tenantId: this.tenantId,
    };
  }
}
