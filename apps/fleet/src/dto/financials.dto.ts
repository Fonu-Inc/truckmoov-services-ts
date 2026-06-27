import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsNumber, IsOptional, Min } from "class-validator";

const STATEMENT_FORMATS = ["pdf", "csv", "xlsx"] as const;

export class ComputeProfitabilityDto {
  @ApiPropertyOptional({ description: "Number of months to aggregate over (defaults to 1)", default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  periodMonths?: number;
}

export class StatementQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  periodMonths?: number;
}

export class StatementExportQueryDto extends StatementQueryDto {
  @ApiPropertyOptional({ enum: STATEMENT_FORMATS, default: "pdf" })
  @IsOptional()
  @IsIn(STATEMENT_FORMATS)
  format?: typeof STATEMENT_FORMATS[number];
}

export class UpsertFinancialConfigDto {
  @ApiPropertyOptional({ nullable: true, description: "Monthly driver wages (NGN)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyWagesNgn?: number | null;

  @ApiPropertyOptional({ nullable: true, description: "Monthly insurance cost (NGN)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyInsuranceNgn?: number | null;

  @ApiPropertyOptional({ nullable: true, description: "Monthly depreciation (NGN)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyDepreciationNgn?: number | null;

  @ApiPropertyOptional({ nullable: true, description: "Other monthly fixed costs (NGN)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyOtherNgn?: number | null;
}
