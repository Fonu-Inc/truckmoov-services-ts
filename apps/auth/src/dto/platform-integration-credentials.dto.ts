import { IsBoolean, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdatePlatformIntegrationCredentialsDto {
  @IsString()
  @MinLength(1)
  category!: string;

  @IsBoolean()
  enabled!: boolean;

  /** Write-only. It is never returned by the API. */
  @IsOptional()
  @IsString()
  secret?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
