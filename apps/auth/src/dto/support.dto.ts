import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { SUPPORT_TICKET_CATEGORIES, SUPPORT_TICKET_CHANNELS, SUPPORT_TICKET_STATUSES } from '../support-ticket.repository';

const TICKET_STATUSES = SUPPORT_TICKET_STATUSES;
const ESCALATION_TARGETS = ['fleetpro_internal', 'fonu_connectivity', 'vendor_installer'] as const;
/** Kept exported under this name: the platform admin screens already import it. */
export const TICKET_CATEGORIES = SUPPORT_TICKET_CATEGORIES;

export class AssignTicketDto {
  @ApiPropertyOptional({
    nullable: true,
    description: 'Platform staff user id. Null or omitted clears the assignment.',
  })
  @IsOptional()
  @IsString()
  assigneeId?: string | null;
}

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

export class CreateSupportTicketDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  subject!: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  description!: string;

  @ApiProperty({ enum: TICKET_CATEGORIES })
  @IsIn(TICKET_CATEGORIES)
  category!: string;

  @ApiPropertyOptional({ enum: SUPPORT_TICKET_CHANNELS })
  @IsOptional()
  @IsIn(SUPPORT_TICKET_CHANNELS)
  channel?: string;

  @ApiPropertyOptional({ description: 'Required when channel is "other".' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  otherChannel?: string;

  @ApiPropertyOptional({ enum: ['low', 'medium', 'high', 'critical'] })
  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'critical'])
  priority?: string;

  @ApiPropertyOptional({ enum: ['device', 'sim', 'vehicle', 'whatsapp', 'billing', 'none'] })
  @IsOptional()
  @IsIn(['device', 'sim', 'vehicle', 'whatsapp', 'billing', 'none'])
  contextType?: string;

  @ApiPropertyOptional({ nullable: true, description: 'Required when contextType is not none.' })
  @IsOptional()
  @IsString()
  contextId?: string | null;
}

export class ReplyToTicketDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  message!: string;
}

export class ReopenTicketDto {
  @ApiProperty({ description: 'What is still wrong, so support knows what to pick back up.' })
  @IsString()
  @MinLength(3)
  reason!: string;
}
