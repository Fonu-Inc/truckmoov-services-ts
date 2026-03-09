import { ApiProperty } from "@nestjs/swagger";
import { StandardApiResponse } from "@shared/openapi";

export class SessionSchema {
  /** JWT access token */
  accessToken!: string;
  /** JWT refresh token */
  refreshToken!: string;
}

export class AuthResponse extends StandardApiResponse<SessionSchema> {
  @ApiProperty({ type: SessionSchema })
  data!: SessionSchema;
}

export class MeResponse extends StandardApiResponse<Record<string, unknown>> {
  @ApiProperty({ type: "object", additionalProperties: true })
  data!: Record<string, unknown>;
}

export class HealthResponse extends StandardApiResponse<{ service: string }> {
  @ApiProperty({ type: "object", properties: { service: { type: "string" } } })
  data!: { service: string };
}
