import { IsString, MinLength } from "class-validator";

export class RefreshDto {
  @IsString()
  @MinLength(12)
  refreshToken!: string;
}
