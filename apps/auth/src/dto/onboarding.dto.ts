import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { KYC_DOCUMENT_TYPES } from '../tenant-kyc-document.repository';

export class CreatePaymentIntentDto {
  @ApiProperty()
  @IsString()
  planCode!: string;

  @ApiProperty({ enum: ['monthly', 'yearly'] })
  @IsEnum(['monthly', 'yearly'])
  billingCycle!: 'monthly' | 'yearly';

  @ApiProperty({ enum: ['paystack', 'momo'] })
  @IsEnum(['paystack', 'momo'])
  gateway!: 'paystack' | 'momo';

  @ApiPropertyOptional({ description: 'Phone number for MoMo USSD push' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'URL to redirect to after Paystack payment completes' })
  @IsOptional()
  @IsString()
  redirectUrl?: string;
}

export class EnterpriseEnquiryDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty()
  @IsString()
  companyName!: string;

  @ApiProperty()
  @IsString()
  message!: string;
}

export class SaveBusinessInfoDto {
  @ApiProperty()
  @IsString()
  companyName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressLine1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  billingEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  yearEstablished?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  numberOfEmployees?: number;
}

export class SubmitDeviceProvisioningRequestDto {
  @ApiProperty()
  @IsString()
  manufacturer!: string;

  @ApiProperty()
  @IsString()
  model!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  useCase?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requesterNotes?: string;
}

export class SimRegistrationItemDto {
  @ApiProperty()
  @IsString()
  iccid!: string;

  @ApiProperty()
  @IsString()
  mobileNumber!: string;

  @ApiProperty()
  @IsString()
  networkOperator!: string;
}

export class RegisterSimsDto {
  @ApiProperty({ type: [SimRegistrationItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SimRegistrationItemDto)
  sims!: SimRegistrationItemDto[];
}

export class SubmitSimProvisioningRequestDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  numberOfSims!: number;

  @ApiProperty()
  @IsNumber()
  dataLimitGb!: number;

  @ApiProperty()
  @IsString()
  preferredOperator!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  useCase?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  deviceMappingEnabled?: boolean;
}

export class SaveFeatureTogglesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  liveTracking?: boolean;

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
  messaging?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  analytics?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  apiAccess?: boolean;
}

export const KYC_DOCUMENT_TYPE_ENUM = KYC_DOCUMENT_TYPES;
