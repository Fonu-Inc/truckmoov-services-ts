import { Type } from "class-transformer";
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";

const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

class BrandingDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  organizationName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string | null;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_PATTERN, {
    message: "primaryColor must be a valid hex color (e.g. #0052CC)",
  })
  primaryColor?: string | null;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_PATTERN, {
    message: "secondaryColor must be a valid hex color (e.g. #00A3FF)",
  })
  secondaryColor?: string | null;
}

class DefaultsDto {
  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsIn(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"])
  dateFormat?: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";

  @IsOptional()
  @IsIn(["monday", "sunday"])
  weekStartsOn?: "monday" | "sunday";
}

export class UpdateOrganizationSettingsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingDto)
  branding?: BrandingDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DefaultsDto)
  defaults?: DefaultsDto;
}
