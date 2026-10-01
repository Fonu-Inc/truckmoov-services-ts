import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class PlatformTopUpDto {
  @ApiProperty({ description: 'Naira. Positive.' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount!: number;

  @ApiProperty({
    description:
      'Why the platform is crediting — a bank transfer reference, a goodwill credit, a correction. Required: this is money created by staff action.',
  })
  @IsString()
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({
    description:
      'Retry key. Repeating a request with the same key credits once. Also accepted as the Idempotency-Key header, which wins.',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
}

export class WalletCreditSettingsDto {
  @ApiProperty({ description: 'Whether the balance may go below zero' })
  @IsBoolean()
  creditEnabled!: boolean;

  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'Naira. Omit for unlimited credit; zero means no headroom at all.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  creditLimit?: number | null;

  @ApiProperty({ type: Number, description: 'Naira. Per tenant, drives the Low status.' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  lowBalanceThreshold!: number;
}
