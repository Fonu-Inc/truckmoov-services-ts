import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Documentation-only DTOs for inbound webhooks.
 *
 * These are referenced via `@ApiBody({ type: ... })` for Swagger only and are
 * intentionally NOT used as the `@Body()` parameter type: external providers
 * (CPaaS, ERP/TMS) send additional, provider-specific fields that the global
 * `forbidNonWhitelisted` ValidationPipe would otherwise reject. The runtime
 * body stays permissive; HMAC signature verification guards authenticity.
 */
export class CpaasInboundWebhookDto {
  @ApiProperty({ description: "Sender address (may be prefixed with 'whatsapp:')" })
  From!: string;

  @ApiProperty({ description: "Message text body" })
  Body!: string;

  @ApiPropertyOptional({ description: "Tenant identifier; defaults to 'default'" })
  tenant_id?: string;
}

export class ErpJobDataDto {
  @ApiPropertyOptional()
  referenceId?: string;

  @ApiPropertyOptional()
  pickupAddress?: string;

  @ApiPropertyOptional()
  dropoffAddress?: string;

  @ApiPropertyOptional()
  scheduledAt?: string;

  @ApiPropertyOptional()
  priority?: string;
}

export class ErpJobSyncWebhookDto {
  @ApiProperty({ description: "External job identifier in the ERP/TMS" })
  externalId!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty({ enum: ["created", "updated", "cancelled"] })
  status!: "created" | "updated" | "cancelled";

  @ApiProperty({ type: ErpJobDataDto, description: "Job payload; additional provider fields are accepted" })
  jobData!: ErpJobDataDto;
}
