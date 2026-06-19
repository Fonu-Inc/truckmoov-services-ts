import { Type } from "class-transformer";
import {
  IsEmail,
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
  @IsEmail()
  contactEmail?: string | null;

  @IsOptional()
  @IsEmail()
  billingEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phoneNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  profilePictureUrl?: string | null;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_PATTERN, { message: "primaryColor must be a valid hex color (e.g. #0052CC)" })
  primaryColor?: string | null;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_PATTERN, { message: "secondaryColor must be a valid hex color (e.g. #00A3FF)" })
  secondaryColor?: string | null;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_PATTERN, { message: "accentColor must be a valid hex color" })
  accentColor?: string | null;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_PATTERN, { message: "successColor must be a valid hex color" })
  successColor?: string | null;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_PATTERN, { message: "warningColor must be a valid hex color" })
  warningColor?: string | null;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_PATTERN, { message: "destructiveColor must be a valid hex color" })
  destructiveColor?: string | null;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_PATTERN, { message: "sidebarBackground must be a valid hex color" })
  sidebarBackground?: string | null;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_PATTERN, { message: "sidebarText must be a valid hex color" })
  sidebarText?: string | null;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_PATTERN, { message: "sidebarAccent must be a valid hex color" })
  sidebarAccent?: string | null;
}

class DefaultsDto {
  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  language?: string;

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
