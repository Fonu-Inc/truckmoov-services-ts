import { StandardApiResponse } from '@shared/openapi';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import {
  ONBOARDING_APPLICANT_TYPES,
  ONBOARDING_IDENTIFICATION_TYPES,
} from '@auth/onboarding';

// @Allow only whitelists each field for the global ValidationPipe. Enforcement
// lives in onboarding-application.validation.ts, which the use cases call.
export class OnboardingApplicationDto {
  @Allow()
  @ApiProperty({ enum: [...ONBOARDING_APPLICANT_TYPES] })
  applicantType!: string;

  @Allow()
  @ApiPropertyOptional({
    description: 'An existing MTN customer, who owes only the Customer Request Letter. Omitted on update keeps the saved value.',
  })
  returningCustomer?: boolean;

  @Allow()
  @ApiProperty({ example: 'Arne logistics Ltd', maxLength: 160 })
  organizationName!: string;

  @Allow()
  @ApiProperty({ example: 'jane@arne.com', maxLength: 254 })
  businessEmail!: string;

  @Allow()
  @ApiProperty({
    example: '+234 80 0000 0000',
    description: 'Nigerian mobile number. Stored in E.164 form.',
  })
  organizationPhone!: string;

  @Allow()
  @ApiProperty({ example: 'Jane Doe', maxLength: 80 })
  contactFullName!: string;

  @Allow()
  @ApiPropertyOptional({ example: 'Fleet Manager', maxLength: 80 })
  contactRole?: string;

  @Allow()
  @ApiProperty({ example: 'Mazi Fedelis Street', maxLength: 200, description: 'Must contain letters. 3 to 200 characters.' })
  streetAddress!: string;

  @Allow()
  @ApiProperty({ example: 'Abuja Municipal Area Council', maxLength: 80, description: 'A local government area of the chosen state.' })
  city!: string;

  @Allow()
  @ApiProperty({
    example: 'FCT',
    description: 'A Nigerian state or FCT. "Lagos State" and "Abuja" are accepted and saved as "Lagos" and "FCT".',
  })
  state!: string;

  @Allow()
  @ApiPropertyOptional({
    example: 'm2m_standard',
    description: 'A code from GET m2m-plans. Required before submission.',
  })
  m2mPlanCode?: string;

  @Allow()
  @ApiPropertyOptional({
    example: 'RC1234567',
    description: 'CAC registration number. Needed for automated verification.',
  })
  rcNumber?: string;

  @Allow()
  @ApiPropertyOptional({
    example: '12345678-0001',
    description: 'Tax identification number. Needed for automated verification.',
  })
  taxIdentificationNumber?: string;

  @Allow()
  @ApiPropertyOptional({ enum: [...ONBOARDING_IDENTIFICATION_TYPES] })
  identificationType?: string;

  @Allow()
  @ApiPropertyOptional({
    example: '12345678901',
    description: 'Number on the identification document supplied.',
  })
  identificationNumber?: string;

  @Allow()
  @ApiPropertyOptional({
    enum: ['existing', 'new'],
    description: 'Telecom Master: use an existing MTN number, or have MTN allocate a new one.',
  })
  telecomMasterNumberType?: string;

  @Allow()
  @ApiPropertyOptional({
    example: '08031234567',
    description: 'Required when telecomMasterNumberType is existing. MTN Nigeria mobile number.',
  })
  telecomMasterMsisdn?: string;
}

export class VerifyTelecomMasterNumberDto {
  @Allow()
  @ApiProperty({ example: '08031234567', description: 'The MTN number to check.' })
  msisdn!: string;
}

class VerifiedTelecomMasterNumberSchema {
  @ApiProperty({ example: '2348031234567', description: 'The number in 234 format.' })
  msisdn!: string;
}

export class VerifiedTelecomMasterNumberResponse extends StandardApiResponse<VerifiedTelecomMasterNumberSchema> {
  @ApiProperty({ type: VerifiedTelecomMasterNumberSchema })
  data!: VerifiedTelecomMasterNumberSchema;
}

export class VerificationCodeDto {
  @Allow()
  @ApiProperty({ example: '123456', description: 'The 6 digit code.' })
  code!: string;
}

export class ResumeApplicationDto {
  @Allow()
  @ApiProperty({ example: 'jane@arne.com' })
  businessEmail!: string;
}

export class BillingEmailDto {
  @Allow()
  @ApiProperty({ example: 'accounts@arne.com' })
  billingEmail!: string;
}

export class OnboardingFulfilmentDto {
  @Allow()
  @ApiProperty({ enum: ['pickup', 'delivery'], description: 'Owner-Operators can only pick up' })
  method!: string;

  @Allow()
  @ApiPropertyOptional({ description: 'Required for pickup: an id from GET onboarding/applications/pickup-locations' })
  pickupLocationId?: string;

  @Allow()
  @ApiPropertyOptional({ description: 'Required for delivery' })
  deliveryStreet?: string;

  @Allow()
  @ApiPropertyOptional({ description: 'Required for delivery' })
  deliveryCity?: string;

  @Allow()
  @ApiPropertyOptional({ description: 'Required for delivery: a Nigerian state' })
  deliveryState?: string;
}
