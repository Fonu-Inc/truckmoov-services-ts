import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class RegisterInvitedDto {
  @IsString()
  @MinLength(10)
  inviteToken!: string;

  @IsString()
  @MaxLength(160)
  fullName!: string;

  // Legacy clients may still send email, but the invite token is the source of truth.
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
