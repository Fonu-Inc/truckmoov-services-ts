import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AI_PROVIDERS, AI_TOOLS } from '../ai-governance.repository';

export class AiProviderPatchDto {
  @ApiPropertyOptional({ enum: AI_PROVIDERS })
  @IsIn(AI_PROVIDERS)
  provider!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ type: String, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(96, { each: true })
  allowedModels?: string[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(96)
  defaultModel?: string | null;

  @ApiPropertyOptional({ enum: AI_TOOLS, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(AI_TOOLS, { each: true })
  allowedTools?: string[];
}

export class AiRateLimitsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxTokensPerRequest?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxRequestsPerMinute?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxTokensPerDayPerTenant?: number;
}

export class AiDataProtectionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  redactPhoneNumbers?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  redactDriverNames?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  redactVehiclePlates?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  storePromptsAndResponses?: boolean;
}

export class UpdateAiGovernanceDto {
  @ApiPropertyOptional({ description: 'The master switch. Off means no AI call leaves the platform.' })
  @IsOptional()
  @IsBoolean()
  matchingEnabled?: boolean;

  @ApiPropertyOptional({ type: AiProviderPatchDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AiProviderPatchDto)
  providers?: AiProviderPatchDto[];

  @ApiPropertyOptional({ type: AiRateLimitsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AiRateLimitsDto)
  rateLimits?: AiRateLimitsDto;

  @ApiPropertyOptional({ type: AiDataProtectionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AiDataProtectionDto)
  dataProtection?: AiDataProtectionDto;
}
