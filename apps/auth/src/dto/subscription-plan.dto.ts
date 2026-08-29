import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateSubscriptionPlanPriceDto {
  @ApiPropertyOptional({ type: Number, description: 'Naira. Omit to leave unchanged.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyPriceNgn?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Naira, the monthly-equivalent rate a yearly subscriber pays. Omit to leave unchanged.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  yearlyMonthlyEquivalentNgn?: number;
}
