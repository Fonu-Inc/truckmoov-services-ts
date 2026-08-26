import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsISO8601, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class ReviewWaybillDto {
  @ApiPropertyOptional({ nullable: true, description: "Tenant-unique once set" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  waybillNumber?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  origin?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  destination?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  vehicleRegistration?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  customerName?: string | null;

  @ApiPropertyOptional({ nullable: true, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weight?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "The unit the weight is in. Stated explicitly: a 28 in tonnes and a 28 in kilograms differ by a thousand.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  weightUnit?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "The date on the document. This is what prices it, not the day it was captured.",
  })
  @IsOptional()
  @IsISO8601()
  waybillDate?: string | null;
}
