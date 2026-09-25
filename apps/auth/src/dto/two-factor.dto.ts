import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, MaxLength } from 'class-validator';

export class TwoFactorCodeDto {
  @ApiProperty({ description: 'The six-digit code from the authenticator app' })
  @IsString()
  // Spaces are common when a person copies the code across, so the length
  // allows for them and the verifier strips them.
  @Length(6, 12)
  code!: string;
}

export class LoginTwoFactorDto {
  @ApiProperty({ description: 'From the password step of the same portal\'s sign-in.' })
  @IsString()
  @MaxLength(2048)
  challengeToken!: string;

  @ApiProperty({ description: 'Six digits from the authenticator, or a recovery code.', example: '123456' })
  @IsString()
  @MaxLength(32)
  code!: string;
}
