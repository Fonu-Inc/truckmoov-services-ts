import { Type } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";

const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

class ThemedColorDto {
  @Matches(HEX_COLOR_PATTERN, { message: "dark must be a valid hex color (e.g. #0052CC)" })
  dark!: string;

  @Matches(HEX_COLOR_PATTERN, { message: "light must be a valid hex color (e.g. #00A3FF)" })
  light!: string;
}

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
  @IsObject()
  @ValidateNested()
  @Type(() => ThemedColorDto)
  primaryColor?: ThemedColorDto | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ThemedColorDto)
  secondaryColor?: ThemedColorDto | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ThemedColorDto)
  accentColor?: ThemedColorDto | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ThemedColorDto)
  successColor?: ThemedColorDto | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ThemedColorDto)
  warningColor?: ThemedColorDto | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ThemedColorDto)
  destructiveColor?: ThemedColorDto | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ThemedColorDto)
  sidebarBackground?: ThemedColorDto | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ThemedColorDto)
  sidebarText?: ThemedColorDto | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ThemedColorDto)
  sidebarAccent?: ThemedColorDto | null;
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
