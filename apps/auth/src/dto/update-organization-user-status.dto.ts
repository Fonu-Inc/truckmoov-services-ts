import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";

export class UpdateOrganizationUserStatusDto {
  @ApiProperty({ enum: ["enabled", "disabled"] })
  @IsEnum(["enabled", "disabled"])
  accountStatus!: "enabled" | "disabled";
}
