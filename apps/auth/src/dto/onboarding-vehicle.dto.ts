import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ONBOARDING_VEHICLE_PURCHASE_TYPES,
  ONBOARDING_VEHICLE_TYPES,
} from '@auth/onboarding';

// Shapes the OpenAPI contract only. Enforcement lives in
// onboarding-application.validation.ts, which the use cases call directly.
export class OnboardingVehicleDto {
  @ApiProperty({ example: 'LAG-123-ABC', maxLength: 20 })
  registrationNumber!: string;

  @ApiProperty({ enum: [...ONBOARDING_VEHICLE_TYPES] })
  vehicleType!: string;

  @ApiProperty({ example: 'Toyota', maxLength: 80 })
  make!: string;

  @ApiProperty({ example: 'Hilux', maxLength: 80 })
  model!: string;

  @ApiPropertyOptional({ example: 2021 })
  year?: number;

  @ApiPropertyOptional({ example: 'ENG-000123', maxLength: 64 })
  engineNumber?: string;

  @ApiPropertyOptional({ example: 'JTEBU5JR9', maxLength: 64 })
  chassisNumber?: string;

  @ApiPropertyOptional({ example: 'White', maxLength: 40 })
  color?: string;

  @ApiPropertyOptional({ example: '2.8L', maxLength: 32 })
  engineCapacity?: string;

  @ApiPropertyOptional({ example: 84500, description: 'Whole kilometres.' })
  odometerReading?: number;

  @ApiPropertyOptional({ enum: [...ONBOARDING_VEHICLE_PURCHASE_TYPES] })
  purchaseType?: string;

  @ApiPropertyOptional({
    example: 'Donated by parent company',
    maxLength: 120,
    description: 'Required when purchaseType is other.',
  })
  purchaseTypeOther?: string;
}

export class OnboardingDeviceRequestDto {
  @ApiProperty({ example: 4, minimum: 1, maximum: 500 })
  quantity!: number;

  @ApiProperty({
    example: 'Tracking for the Lagos distribution fleet.',
    minLength: 10,
    maxLength: 1000,
  })
  useCase!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  notes?: string;
}
