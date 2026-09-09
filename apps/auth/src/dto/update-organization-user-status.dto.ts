import { ApiProperty } from "@nestjs/swagger";
import {
  IsIn,
} from "class-validator";

export class UpdateOrganizationUserStatusDto {
  @ApiProperty({ enum: ["enabled", "disabled"] })
  @IsIn(["enabled", "disabled"])
  accountStatus!: "enabled" | "disabled";
}
