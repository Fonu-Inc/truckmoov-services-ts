import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsIn, IsString, MaxLength, MinLength, ValidateIf } from "class-validator";

export const MIN_STATUS_REASON_LENGTH = 5;
export const MAX_STATUS_REASON_LENGTH = 500;

export class UpdateSystemTenantStatusDto {
  @ApiProperty({ enum: ["active", "suspended"] })
  @IsIn(["active", "suspended"])
  status!: "active" | "suspended";

  @ApiPropertyOptional({
    description: "Why the tenant is being suspended. Required for any status other than active.",
    minLength: MIN_STATUS_REASON_LENGTH,
    maxLength: MAX_STATUS_REASON_LENGTH,
  })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @ValidateIf((dto: UpdateSystemTenantStatusDto) => dto.status !== "active" || dto.reason !== undefined)
  @IsString()
  @MinLength(MIN_STATUS_REASON_LENGTH)
  @MaxLength(MAX_STATUS_REASON_LENGTH)
  reason?: string;
}
