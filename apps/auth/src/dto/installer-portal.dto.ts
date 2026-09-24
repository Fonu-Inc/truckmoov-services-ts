import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { NIGERIAN_STATES } from '../contexts/onboarding/domain/onboarding-application.validation';

export class UpdateInstallerProfileDto {
  @ApiPropertyOptional({ example: 'Tunde' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Akinwale' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @ApiPropertyOptional({ example: '+2348032214478' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;

  @ApiPropertyOptional({ enum: NIGERIAN_STATES })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 'Ikeja' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;
}

export class BindUnitDeviceDto {
  @ApiProperty({ description: 'The fleet device fitted as this unit' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  fleetDeviceId!: string;
}
