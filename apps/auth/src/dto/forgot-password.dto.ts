import { IsEmail, IsEnum, IsOptional, IsString } from "class-validator";

export class ForgotPasswordDto {
  @IsEmail()
  identifier!: string;

  @IsEnum(["email", "sms"])
  method!: "email" | "sms";

  @IsOptional()
  @IsString()
  phone?: string;
}
