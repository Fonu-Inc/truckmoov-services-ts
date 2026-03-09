import { IsString, MinLength } from "class-validator";

export class RefreshDto {
  /** JWT refresh token (min 12 chars) */
  @IsString()
  @MinLength(12)
  refreshToken!: string;
}
