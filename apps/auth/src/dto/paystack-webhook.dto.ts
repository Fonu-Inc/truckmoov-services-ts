import { ApiProperty } from "@nestjs/swagger";

/**
 * Documentation-only DTO for the Paystack webhook payload.
 *
 * The webhook handler keeps its parameter typed as `Record<string, unknown>`
 * and never binds this class, because the global ValidationPipe uses
 * `forbidNonWhitelisted` and would reject Paystack's extra fields, breaking the
 * live webhook. This class exists solely so Swagger can document the request
 * body shape via `@ApiBody`.
 */
export class PaystackWebhookDto {
  @ApiProperty({ description: "Paystack event name", example: "charge.success" })
  event!: string;

  @ApiProperty({
    type: "object",
    additionalProperties: true,
    description: "Event payload as sent by Paystack (e.g. reference, metadata)",
  })
  data!: object;
}
