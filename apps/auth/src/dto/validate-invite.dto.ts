import { IsString, MinLength } from "class-validator";

export class ValidateInviteDto {
  @IsString()
  @MinLength(10)
  token!: string;
}
