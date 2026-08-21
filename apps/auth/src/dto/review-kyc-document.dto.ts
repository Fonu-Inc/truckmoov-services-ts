import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { KYC_DOCUMENT_STATUSES } from '../tenant-kyc-document.repository';

export class RejectKycDocumentDto {
  @ApiProperty({ description: 'Shown to the tenant, so it must explain what to fix' })
  @IsString()
  @MinLength(1)
  reason!: string;
}

export class KycReviewQueueQueryDto {
  @ApiPropertyOptional({ enum: KYC_DOCUMENT_STATUSES })
  @IsOptional()
  @IsIn(KYC_DOCUMENT_STATUSES as unknown as string[])
  status?: 'pending' | 'under_review' | 'verified' | 'rejected';

  @ApiPropertyOptional() @IsOptional() @IsString() tenantId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Type(() => Number) limit?: number;
}
