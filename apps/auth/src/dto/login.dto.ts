import { IsString, MinLength } from "class-validator";

export class LoginDto {
  /** Username or email address */
  @IsString()
  username!: string;

  /** Account password (min 8 chars) */
  @IsString()
  @MinLength(8)
  password!: string;
}
