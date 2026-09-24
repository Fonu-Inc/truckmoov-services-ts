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
  @ApiProperty({ example: 'Mazi Fedelis Street', maxLength: 200 })
  streetAddress!: string;

  @Allow()
  @ApiProperty({ example: 'Abuja', maxLength: 80 })
  city!: string;

  @Allow()
  @ApiProperty({ example: 'FCT', description: 'A Nigerian state or FCT.' })
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
