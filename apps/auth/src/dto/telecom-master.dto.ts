import { ApiProperty } from '@nestjs/swagger';
import { StandardApiResponse } from '@shared/openapi';

const NULLABLE_STRING = { type: String, nullable: true } as const;

export class TelecomMasterRequestSchema {
  @ApiProperty() id!: string;
  @ApiProperty(NULLABLE_STRING) tenantId!: string | null;
  @ApiProperty() organizationName!: string;
  @ApiProperty() contactEmail!: string;
  @ApiProperty(NULLABLE_STRING) applicationId!: string | null;
  @ApiProperty() applicationReference!: string;
  @ApiProperty(NULLABLE_STRING) msisdn!: string | null;
  @ApiProperty(NULLABLE_STRING) simSerial!: string | null;
  @ApiProperty({ enum: ['existing', 'new'] }) numberType!: string;
  @ApiProperty({
    enum: [
      'not_selected',
      'pending_verification',
      'verified',
      'allocation_pending',
      'allocated',
      'verification_failed',
      'allocation_failed',
    ],
  })
  status!: string;
  @ApiProperty(NULLABLE_STRING) mtnReference!: string | null;
  @ApiProperty(NULLABLE_STRING) failureReason!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class TelecomMasterEventSchema {
  @ApiProperty() id!: string;
  @ApiProperty() requestId!: string;
  @ApiProperty() action!: string;
  @ApiProperty(NULLABLE_STRING) detail!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class TelecomMasterListSchema {
  @ApiProperty({ type: [TelecomMasterRequestSchema] })
  requests!: TelecomMasterRequestSchema[];
  @ApiProperty() total!: number;
  @ApiProperty({ format: 'date-time' }) generatedAt!: string;
}

export class TelecomMasterListResponse extends StandardApiResponse<TelecomMasterListSchema> {
  @ApiProperty({ type: TelecomMasterListSchema }) data!: TelecomMasterListSchema;
}

export class TelecomMasterDetailSchema {
  @ApiProperty({ type: TelecomMasterRequestSchema }) request!: TelecomMasterRequestSchema;
  @ApiProperty({ type: [TelecomMasterEventSchema] }) events!: TelecomMasterEventSchema[];
}

export class TelecomMasterDetailResponse extends StandardApiResponse<TelecomMasterDetailSchema> {
  @ApiProperty({ type: TelecomMasterDetailSchema }) data!: TelecomMasterDetailSchema;
}
