import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class TwoFactorCodeDto {
  @ApiProperty({ description: 'The six-digit code from the authenticator app' })
  @IsString()
  // Spaces are common when a person copies the code across, so the length
  // allows for them and the verifier strips them.
  @Length(6, 12)
  code!: string;
}
