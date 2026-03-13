import { IsString, MinLength } from "class-validator";

export class VerifyResetDto {
  @IsString()
  @MinLength(10)
  token!: string;
}
