import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { NIGERIAN_STATES } from '../contexts/onboarding/domain/onboarding-application.validation';
import {
  INSTALLER_CAPABILITIES,
  MAX_ACTIVE_JOBS_LIMIT,
} from '../contexts/installation/domain/installer';

const CAPABILITIES = Object.keys(INSTALLER_CAPABILITIES);

export class CreateInstallerDto {
  @ApiProperty({ example: 'Tunde' })
  @IsString()
  @MaxLength(60)
  firstName!: string;

  @ApiProperty({ example: 'Akinwale' })
  @IsString()
  @MaxLength(60)
  lastName!: string;

  @ApiProperty({ example: 'tunde.akinwale@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: '+2348031234567' })
  @IsString()
  @MaxLength(20)
  phoneNumber!: string;

  @ApiProperty({ type: [String], enum: NIGERIAN_STATES, description: 'States the installer works in' })
  @IsArray()
  @ArrayMaxSize(NIGERIAN_STATES.length)
  @IsString({ each: true })
  serviceAreas!: string[];

  @ApiProperty({ type: [String], enum: CAPABILITIES })
  @IsArray()
  @IsIn(CAPABILITIES, { each: true })
  capabilities!: string[];

  @ApiPropertyOptional({ example: 3, minimum: 1, maximum: MAX_ACTIVE_JOBS_LIMIT, default: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_ACTIVE_JOBS_LIMIT)
  maxActiveJobs?: number;
}

/** The email is the installer's sign-in, so it is never edited here. */
export class UpdateInstallerDto extends PartialType(OmitType(CreateInstallerDto, ['email'] as const)) {}
