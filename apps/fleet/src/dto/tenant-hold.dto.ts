import { Transform } from "class-transformer";
import { ArrayMaxSize, IsArray, IsIn, IsObject, IsOptional, IsString, MaxLength } from "class-validator";

export class TenantHoldDto {
  @IsIn(["manual", "non_payment"])
  cause!: "manual" | "non_payment";

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsObject()
  actor?: { id?: string; name?: string };
}

export class TenantHoldPreviewDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  tenantIds!: string[];
}
