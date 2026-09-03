import { ApiProperty } from '@nestjs/swagger';
import { ONBOARDING_APPLICANT_TYPES } from '../onboarding-application.repository';

// Shapes the OpenAPI contract only. Enforcement lives in
// onboarding-application.validation.ts, which the use cases call directly.
export class OnboardingApplicationDto {
  @ApiProperty({ enum: [...ONBOARDING_APPLICANT_TYPES] })
  applicantType!: string;

  @ApiProperty({ example: 'Arne logistics Ltd', maxLength: 160 })
  organizationName!: string;

  @ApiProperty({ example: 'jane@arne.com', maxLength: 254 })
  businessEmail!: string;

  @ApiProperty({
    example: '+234 80 0000 0000',
    description: 'Nigerian mobile number. Stored in E.164 form.',
  })
  organizationPhone!: string;

  @ApiProperty({ example: 'Jane Doe', maxLength: 80 })
  contactFullName!: string;

  @ApiProperty({ example: 'Fleet Manager', maxLength: 80 })
  contactRole!: string;

  @ApiProperty({ example: 'Mazi Fedelis Street', maxLength: 200 })
  streetAddress!: string;

  @ApiProperty({ example: 'Abuja', maxLength: 80 })
  city!: string;

  @ApiProperty({ example: 'FCT', description: 'A Nigerian state or FCT.' })
  state!: string;
}
