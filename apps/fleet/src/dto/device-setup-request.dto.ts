import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";
import {
  DEVICE_SETUP_REQUEST_STATUSES,
  TRACKER_TYPES,
  type DeviceSetupRequestStatus,
  type TrackerType,
} from "../contexts/fleet/device-setup-requests/domain/entities/device-setup-request.entity";
import { PaginationQueryDto } from "@shared/pagination";

export class CreateDeviceSetupRequestDto {
  /** Optional: the platform picks the hardware when it fulfils the request. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  manufacturer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  model?: string;

  /** Optional: the platform picks the hardware when it fulfils the request. */
  @IsOptional()
  @IsIn(TRACKER_TYPES)
  trackerType?: TrackerType;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsBoolean()
  simRequired?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  carrierId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  planType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  bundleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  vehicleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  preferredDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  preferredTime?: string;

  @IsString()
  @MaxLength(2000)
  useCase!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  organisationName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  requestingEmail?: string;
}

export class UpdateDeviceSetupRequestStatusDto {
  @IsIn(DEVICE_SETUP_REQUEST_STATUSES)
  status!: DeviceSetupRequestStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class DeviceSetupRequestListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsIn(DEVICE_SETUP_REQUEST_STATUSES)
  status?: DeviceSetupRequestStatus;
}
