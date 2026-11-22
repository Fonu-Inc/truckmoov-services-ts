import { ApiProperty } from '@nestjs/swagger';
import { StandardApiResponse } from '@shared/openapi';

export class KycStorageUsageSchema {
  @ApiProperty() files!: number;
  @ApiProperty() bytes!: number;
}

export class TenantStorageUsageSchema {
  @ApiProperty({ description: 'Bytes counted against the plan, across every source of tenant files' })
  usedBytes!: number;

  @ApiProperty({ type: String, nullable: true })
  planName!: string | null;

  @ApiProperty({ type: Number, nullable: true, description: 'Plan storage limit in bytes; null when the plan sets none' })
  limitBytes!: number | null;

  @ApiProperty({ type: KycStorageUsageSchema })
  kyc!: KycStorageUsageSchema;
}

export class TenantStorageUsageResponse extends StandardApiResponse<TenantStorageUsageSchema> {
  @ApiProperty({ type: TenantStorageUsageSchema })
  data!: TenantStorageUsageSchema;
}
