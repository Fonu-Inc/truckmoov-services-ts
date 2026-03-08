import { IsOptional, IsString } from "class-validator";

export class CreateVehicleDto {
  @IsString()
  plateNumber!: string;

  @IsString()
  model!: string;

  @IsOptional()
  @IsString()
  tenantId?: string;
}

export class UpdateVehicleDto {
  @IsOptional()
  @IsString()
  plateNumber?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;
}
