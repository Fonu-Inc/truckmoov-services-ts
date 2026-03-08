import { IsOptional, IsString } from "class-validator";

export class CreateDriverDto {
  @IsString()
  name!: string;

  @IsString()
  licenseNumber!: string;

  @IsOptional()
  @IsString()
  tenantId?: string;
}

export class UpdateDriverDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;
}
