import { IsEmail, IsEnum } from "class-validator";
import { Role, INVITABLE_ROLES } from "@shared/rbac";

const InvitableRoleValues = INVITABLE_ROLES as readonly string[];

export class InviteUserDto {
  @IsEmail()
  email!: string;

  @IsEnum(Role, { message: `role must be one of: ${InvitableRoleValues.join(", ")}` })
  role!: string;
}
