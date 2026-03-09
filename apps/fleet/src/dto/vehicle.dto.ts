import { IsOptional, IsString } from "class-validator";

export class CreateVehicleDto {
  /** License plate number of the vehicle */
  @IsString()
  plateNumber!: string;

  /** Vehicle make and model */
  @IsString()
  model!: string;

  /** Tenant scope; defaults to DEFAULT_TENANT env */
  @IsOptional()
  @IsString()
  tenantId?: string;
}

export class UpdateVehicleDto {
  /** License plate number of the vehicle */
  @IsOptional()
  @IsString()
  plateNumber?: string;

  /** Vehicle make and model */
  @IsOptional()
  @IsString()
  model?: string;

  /** Tenant scope */
  @IsOptional()
  @IsString()
  tenantId?: string;
}
