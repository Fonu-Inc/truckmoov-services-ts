import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const TICKET_STATUSES = ['open', 'in_progress', 'waiting_on_tenant', 'escalated', 'resolved', 'closed'] as const;
const ESCALATION_TARGETS = ['fleetpro_internal', 'fonu_connectivity', 'vendor_installer'] as const;

export class UpdateTicketStatusDto {
  @ApiProperty({ enum: TICKET_STATUSES })
  @IsIn(TICKET_STATUSES)
  status!: string;
}

export class EscalateTicketDto {
  @ApiProperty({ enum: ESCALATION_TARGETS })
  @IsIn(ESCALATION_TARGETS)
  escalatedTo!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SendSupportMessageDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  message!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}
