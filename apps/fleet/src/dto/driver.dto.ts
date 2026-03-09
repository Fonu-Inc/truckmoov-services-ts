import { IsOptional, IsString } from "class-validator";

export class CreateDriverDto {
  /** Driver's full name */
  @IsString()
  name!: string;

  /** Driver license number */
  @IsString()
  licenseNumber!: string;

  /** Tenant scope; defaults to DEFAULT_TENANT env */
  @IsOptional()
  @IsString()
  tenantId?: string;
}

export class UpdateDriverDto {
  /** Driver's full name */
  @IsOptional()
  @IsString()
  name?: string;

  /** Driver license number */
  @IsOptional()
  @IsString()
  licenseNumber?: string;

  /** Tenant scope */
  @IsOptional()
  @IsString()
  tenantId?: string;
}
