import { ApiProperty } from "@nestjs/swagger";
import { StandardApiResponse } from "@shared/openapi";
import { FLEET_STORAGE_CATEGORIES, type FleetStorageCategory } from "../storage-usage.service";

export class StorageCategoryUsageSchema {
  @ApiProperty({ enum: FLEET_STORAGE_CATEGORIES }) key!: FleetStorageCategory;
  @ApiProperty() files!: number;
  @ApiProperty({ type: Number, nullable: true, description: "Bytes of the files with a recorded size; null when none has one" })
  bytes!: number | null;
  @ApiProperty({ description: "Files stored before sizes were recorded, not included in bytes" }) unsizedFiles!: number;
}

export class FleetStorageUsageSchema {
  @ApiProperty({ type: [StorageCategoryUsageSchema] }) categories!: StorageCategoryUsageSchema[];
}

export class FleetStorageUsageResponse extends StandardApiResponse<FleetStorageUsageSchema> {
  @ApiProperty({ type: FleetStorageUsageSchema })
  data!: FleetStorageUsageSchema;
}
