import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class VerifyEmailDto {
  @IsString()
  @MinLength(10)
  token!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
