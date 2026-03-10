import { IsEnum, IsString, MinLength } from "class-validator";
import { Role } from "@shared/rbac";

export class ChangeRoleDto {
  @IsString()
  @MinLength(1)
  targetUserId!: string;

  @IsEnum(Role)
  newRole!: string;
}
