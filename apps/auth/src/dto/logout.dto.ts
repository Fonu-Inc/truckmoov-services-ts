import { IsString, MinLength } from "class-validator";

export class LogoutDto {
  @IsString()
  @MinLength(12)
  refreshToken!: string;
}
