import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsObject, IsOptional, ValidateNested } from 'class-validator';
import {
  TenantCompanyDetailsDto,
  TenantDeviceProvisioningDto,
  TenantFeatureFlagsDto,
  TenantSimAssignmentDto,
  TenantSubscriptionSelectionDto,
} from './create-system-tenant.dto';

export class UpdateTenantCompanyDetailsDto extends PartialType(
  TenantCompanyDetailsDto,
) {}

export class UpdateTenantSubscriptionSelectionDto extends PartialType(
  TenantSubscriptionSelectionDto,
) {}

export class UpdateTenantDeviceProvisioningDto extends PartialType(
  TenantDeviceProvisioningDto,
) {}

export class UpdateTenantSimAssignmentDto extends PartialType(
  TenantSimAssignmentDto,
) {}

export class UpdateTenantFeatureFlagsDto extends PartialType(
  TenantFeatureFlagsDto,
) {}

export class UpdateSystemTenantDto {
  @ApiPropertyOptional({ type: UpdateTenantCompanyDetailsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateTenantCompanyDetailsDto)
  company?: UpdateTenantCompanyDetailsDto;

  @ApiPropertyOptional({ type: UpdateTenantSubscriptionSelectionDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateTenantSubscriptionSelectionDto)
  subscription?: UpdateTenantSubscriptionSelectionDto;

  @ApiPropertyOptional({ type: UpdateTenantDeviceProvisioningDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateTenantDeviceProvisioningDto)
  deviceProvisioning?: UpdateTenantDeviceProvisioningDto;

  @ApiPropertyOptional({ type: UpdateTenantSimAssignmentDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateTenantSimAssignmentDto)
  simAssignment?: UpdateTenantSimAssignmentDto;

  @ApiPropertyOptional({ type: UpdateTenantFeatureFlagsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UpdateTenantFeatureFlagsDto)
  features?: UpdateTenantFeatureFlagsDto;
}
