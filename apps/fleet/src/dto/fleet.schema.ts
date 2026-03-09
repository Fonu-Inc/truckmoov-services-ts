import { ApiProperty } from "@nestjs/swagger";
import { StandardApiResponse } from "@shared/openapi";

/** Vehicle record */
export class VehicleSchema {
  /** UUID */
  id!: string;
  /** License plate */
  plateNumber!: string;
  /** Make and model */
  model!: string;
  /** Tenant scope */
  tenantId!: string;
}

export class VehicleResponse extends StandardApiResponse<VehicleSchema> {
  @ApiProperty({ type: VehicleSchema })
  data!: VehicleSchema;
}

export class VehicleListResponse extends StandardApiResponse<VehicleSchema[]> {
  @ApiProperty({ type: VehicleSchema, isArray: true })
  data!: VehicleSchema[];
}

/** Driver record */
export class DriverSchema {
  /** UUID */
  id!: string;
  /** Full name */
  name!: string;
  /** Driver license number */
  licenseNumber!: string;
  /** Tenant scope */
  tenantId!: string;
}

export class DriverResponse extends StandardApiResponse<DriverSchema> {
  @ApiProperty({ type: DriverSchema })
  data!: DriverSchema;
}

export class DriverListResponse extends StandardApiResponse<DriverSchema[]> {
  @ApiProperty({ type: DriverSchema, isArray: true })
  data!: DriverSchema[];
}

export class JobStatusResponse extends StandardApiResponse<null> {
  @ApiProperty({ nullable: true, type: "object" })
  data!: null;
}

export class FleetHealthResponse extends StandardApiResponse<{ service: string }> {
  @ApiProperty({ type: "object", properties: { service: { type: "string" } } })
  data!: { service: string };
}
