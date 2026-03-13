import { IsEmail, IsString, MinLength } from "class-validator";

export class RegisterInvitedDto {
  @IsString()
  @MinLength(10)
  inviteToken!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
