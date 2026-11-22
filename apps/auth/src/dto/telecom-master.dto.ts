import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
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
  @ApiProperty(NULLABLE_STRING) fromStatus!: string | null;
  @ApiProperty(NULLABLE_STRING) toStatus!: string | null;
  @ApiProperty(NULLABLE_STRING) actorId!: string | null;
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

export class TenantTelecomMasterSchema {
  @ApiProperty({ type: TelecomMasterRequestSchema, nullable: true })
  request!: TelecomMasterRequestSchema | null;
}

export class TenantTelecomMasterResponse extends StandardApiResponse<TenantTelecomMasterSchema> {
  @ApiProperty({ type: TenantTelecomMasterSchema }) data!: TenantTelecomMasterSchema;
}

export class SubmitTelecomMasterDto {
  @ApiProperty({ enum: ['existing', 'new'] })
  @IsIn(['existing', 'new'])
  numberType!: 'existing' | 'new';

  @ApiPropertyOptional({ description: 'Required for an existing number. Any Nigerian MTN mobile format.' })
  @ValidateIf((o: SubmitTelecomMasterDto) => o.numberType === 'existing')
  @IsString()
  @MaxLength(32)
  msisdn?: string;
}

export class ResolveTelecomMasterDto {
  @ApiProperty({ enum: ['verified', 'verification_failed', 'allocated', 'allocation_failed'] })
  @IsIn(['verified', 'verification_failed', 'allocated', 'allocation_failed'])
  outcome!: 'verified' | 'verification_failed' | 'allocated' | 'allocation_failed';

  @ApiPropertyOptional({ description: 'The allocated number. Required when outcome is allocated.' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  msisdn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  simSerial?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  mtnReference?: string;

  @ApiPropertyOptional({ description: 'Required for a failed outcome.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  failureReason?: string;
}
