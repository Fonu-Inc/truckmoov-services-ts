import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UnrecognisedDeviceActionDto {
  @ApiProperty({ description: 'Why the sender is being dismissed or blocked. Recorded in the audit log.' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
