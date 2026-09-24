import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import {
  ONBOARDING_VEHICLE_PURCHASE_TYPES,
  ONBOARDING_VEHICLE_TYPES,
} from '@auth/onboarding';

// @Allow only whitelists each field for the global ValidationPipe. Enforcement
// lives in onboarding-application.validation.ts, which the use cases call.
export class OnboardingVehicleDto {
  @Allow()
  @ApiProperty({ example: 'LAG-123-ABC', maxLength: 20 })
  registrationNumber!: string;

  @Allow()
  @ApiProperty({ enum: [...ONBOARDING_VEHICLE_TYPES] })
  vehicleType!: string;

  @Allow()
  @ApiProperty({ example: 'Toyota', maxLength: 80 })
  make!: string;

  @Allow()
  @ApiProperty({ example: 'Hilux', maxLength: 80 })
  model!: string;

  @Allow()
  @ApiPropertyOptional({ example: 2021 })
  year?: number;

  @Allow()
  @ApiPropertyOptional({ example: 'ENG-000123', maxLength: 64 })
  engineNumber?: string;

  @Allow()
  @ApiPropertyOptional({ example: 'JTEBU5JR9', maxLength: 64 })
  chassisNumber?: string;

  @Allow()
  @ApiPropertyOptional({ example: 'White', maxLength: 40 })
  color?: string;

  @Allow()
  @ApiPropertyOptional({ example: '2.8L', maxLength: 32 })
  engineCapacity?: string;

  @Allow()
  @ApiPropertyOptional({ example: 84500, description: 'Whole kilometres.' })
  odometerReading?: number;

  @Allow()
  @ApiPropertyOptional({ enum: [...ONBOARDING_VEHICLE_PURCHASE_TYPES] })
  purchaseType?: string;

  @Allow()
  @ApiPropertyOptional({
    example: 'Donated by parent company',
    maxLength: 120,
    description: 'Required when purchaseType is other.',
  })
  purchaseTypeOther?: string;
}

export class OnboardingDeviceRequestDto {
  @Allow()
  @ApiProperty({ example: 4, minimum: 1, maximum: 500 })
  quantity!: number;

  @Allow()
  @ApiProperty({
    example: 'Tracking for the Lagos distribution fleet.',
    minLength: 10,
    maxLength: 1000,
  })
  useCase!: string;

  @Allow()
  @ApiPropertyOptional({ maxLength: 1000 })
  notes?: string;
}
