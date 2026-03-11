import { ApiProperty } from "@nestjs/swagger";
import { StandardApiResponse } from "@shared/openapi";

export class VehicleGpsDeviceSchema {
  @ApiProperty()
  deviceId!: string;

  @ApiProperty()
  provider!: string;

  @ApiProperty()
  serialNumber!: string;

  @ApiProperty()
  installedAt!: string;
}

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
  /** Operational availability */
  status!: "active" | "inactive";
  /** Assigned driver ID, if any */
  assignedDriverId!: string | null;
  /** Mapped GPS device */
  gpsDevice!: VehicleGpsDeviceSchema | null;
}

export class VehicleResponse extends StandardApiResponse<VehicleSchema> {
  @ApiProperty({ type: VehicleSchema })
  data!: VehicleSchema;
}

export class VehicleListResponse extends StandardApiResponse<VehicleSchema[]> {
  @ApiProperty({ type: VehicleSchema, isArray: true })
  data!: VehicleSchema[];
}

export class DriverContactChannelsSchema {
  @ApiProperty({ nullable: true })
  whatsappNumber!: string | null;

  @ApiProperty({ nullable: true })
  smsNumber!: string | null;

  @ApiProperty({ nullable: true })
  voiceNumber!: string | null;
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
  /** Operational availability */
  status!: "active" | "inactive";
  /** Assigned vehicle ID, if any */
  assignedVehicleId!: string | null;
  /** Contact channels used for dispatch communications */
  contactChannels!: DriverContactChannelsSchema;
}

export class DriverResponse extends StandardApiResponse<DriverSchema> {
  @ApiProperty({ type: DriverSchema })
  data!: DriverSchema;
}

export class DriverListResponse extends StandardApiResponse<DriverSchema[]> {
  @ApiProperty({ type: DriverSchema, isArray: true })
  data!: DriverSchema[];
}

export class JobSchema {
  @ApiProperty()
  jobId!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class JobListResponse extends StandardApiResponse<JobSchema[]> {
  @ApiProperty({ type: JobSchema, isArray: true })
  data!: JobSchema[];
}

export class VehicleDriverAssignmentSchema {
  @ApiProperty({ type: VehicleSchema })
  vehicle!: VehicleSchema;

  @ApiProperty({ type: DriverSchema })
  driver!: DriverSchema;
}

export class VehicleDriverAssignmentResponse extends StandardApiResponse<VehicleDriverAssignmentSchema> {
  @ApiProperty({ type: VehicleDriverAssignmentSchema })
  data!: VehicleDriverAssignmentSchema;
}

export class BulkVehicleImportSchema {
  @ApiProperty()
  created!: number;

  @ApiProperty()
  updated!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty({ type: VehicleSchema, isArray: true })
  records!: VehicleSchema[];
}

export class BulkVehicleImportResponse extends StandardApiResponse<BulkVehicleImportSchema> {
  @ApiProperty({ type: BulkVehicleImportSchema })
  data!: BulkVehicleImportSchema;
}

export class BulkDriverImportSchema {
  @ApiProperty()
  created!: number;

  @ApiProperty()
  updated!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty({ type: DriverSchema, isArray: true })
  records!: DriverSchema[];
}

export class BulkDriverImportResponse extends StandardApiResponse<BulkDriverImportSchema> {
  @ApiProperty({ type: BulkDriverImportSchema })
  data!: BulkDriverImportSchema;
}

export class DispatchSearchSchema {
  @ApiProperty({ type: VehicleSchema, isArray: true })
  vehicles!: VehicleSchema[];

  @ApiProperty({ type: DriverSchema, isArray: true })
  drivers!: DriverSchema[];

  @ApiProperty({ type: JobSchema, isArray: true })
  jobs!: JobSchema[];
}

export class DispatchSearchResponse extends StandardApiResponse<DispatchSearchSchema> {
  @ApiProperty({ type: DispatchSearchSchema })
  data!: DispatchSearchSchema;
}

export class JobStatusResponse extends StandardApiResponse<null> {
  @ApiProperty({ nullable: true, type: "object" })
  data!: null;
}

export class FleetHealthResponse extends StandardApiResponse<{ service: string }> {
  @ApiProperty({ type: "object", properties: { service: { type: "string" } } })
  data!: { service: string };
}
