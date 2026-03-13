import { IsString, MinLength } from "class-validator";

export class LoginDto {
  /** Email address */
  @IsString()
  email!: string;

  /** Account password (min 8 chars) */
  @IsString()
  @MinLength(8)
  password!: string;
}
