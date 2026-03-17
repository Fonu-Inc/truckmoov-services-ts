import { IsString, MaxLength, MinLength } from "class-validator";

export class CompleteProfileDto {
  @IsString()
  @MinLength(10)
  token!: string;

  @IsString()
  @MaxLength(160)
  fullName!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
