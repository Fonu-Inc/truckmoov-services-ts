import { ApiProperty } from "@nestjs/swagger";
import {
  IsIn,
} from "class-validator";

export class UpdateSystemTenantStatusDto {
  @ApiProperty({ enum: ["active", "suspended"] })
  @IsIn(["active", "suspended"])
  status!: "active" | "suspended";
}
