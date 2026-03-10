import { IsEmail, IsEnum, IsOptional, IsString, MinLength, ValidateIf } from "class-validator";

export class VerifyResetDto {
  @IsEnum(["email", "sms"])
  method!: "email" | "sms";

  @ValidateIf((o) => o.method === "email")
  @IsString()
  @MinLength(10)
  token?: string;

  @ValidateIf((o) => o.method === "sms")
  @IsEmail()
  identifier?: string;

  @ValidateIf((o) => o.method === "sms")
  @IsString()
  @MinLength(6)
  code?: string;
}
