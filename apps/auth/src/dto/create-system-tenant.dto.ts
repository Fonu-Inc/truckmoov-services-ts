import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  SIM_CARRIERS,
  SIM_DATA_PACKAGES,
  TENANT_BILLING_CYCLES,
  TENANT_ORGANIZATION_TYPES,
} from '../tenant-onboarding.repository';

export class TenantCompanyDetailsDto {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  companyName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  contactName!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phoneNumber?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsEmail()
  billingEmail?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  businessAddress?: string;

  @ApiProperty({ enum: TENANT_ORGANIZATION_TYPES })
  @IsEnum(TENANT_ORGANIZATION_TYPES)
  organizationType!: (typeof TENANT_ORGANIZATION_TYPES)[number];
}

export class TenantSubscriptionSelectionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  planCode!: string;

  @ApiProperty({ enum: TENANT_BILLING_CYCLES })
  @IsEnum(TENANT_BILLING_CYCLES)
  billingCycle!: (typeof TENANT_BILLING_CYCLES)[number];
}

export class TenantDeviceProvisioningDto {
  @ApiProperty()
  @IsBoolean()
  provisionNow!: boolean;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((value) => value.provisionNow)
  @IsInt()
  @Min(1)
  numberOfDevices?: number;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((value) => value.provisionNow)
  @IsString()
  @MaxLength(120)
  deviceManufacturer?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceModel?: string;
}

export class TenantSimAssignmentDto {
  @ApiProperty()
  @IsBoolean()
  provisionNow!: boolean;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((value) => value.provisionNow)
  @IsInt()
  @Min(1)
  numberOfSims?: number;

  @ApiPropertyOptional({ enum: SIM_CARRIERS, nullable: true })
  @ValidateIf((value) => value.provisionNow)
  @IsEnum(SIM_CARRIERS)
  carrier?: (typeof SIM_CARRIERS)[number];

  @ApiPropertyOptional({ enum: SIM_DATA_PACKAGES, nullable: true })
  @ValidateIf((value) => value.provisionNow)
  @IsEnum(SIM_DATA_PACKAGES)
  dataPackage?: (typeof SIM_DATA_PACKAGES)[number];
}

export class TenantFeatureFlagsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  liveTracking?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  messaging?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  geofencing?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  routeOptimization?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  advancedAnalytics?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  apiAccess?: boolean;
}

export class CreateSystemTenantDto {
  @ApiProperty({ type: TenantCompanyDetailsDto })
  @IsObject()
  @ValidateNested()
  @Type(() => TenantCompanyDetailsDto)
  company!: TenantCompanyDetailsDto;

  @ApiProperty({ type: TenantSubscriptionSelectionDto })
  @IsObject()
  @ValidateNested()
  @Type(() => TenantSubscriptionSelectionDto)
  subscription!: TenantSubscriptionSelectionDto;

  @ApiPropertyOptional({ type: TenantDeviceProvisioningDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TenantDeviceProvisioningDto)
  deviceProvisioning?: TenantDeviceProvisioningDto;

  @ApiPropertyOptional({ type: TenantSimAssignmentDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TenantSimAssignmentDto)
  simAssignment?: TenantSimAssignmentDto;

  @ApiPropertyOptional({ type: TenantFeatureFlagsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => TenantFeatureFlagsDto)
  features?: TenantFeatureFlagsDto;
}
