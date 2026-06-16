import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RejectDeviceSetupRequestDto {
  @ApiProperty({ description: 'Reason for rejecting the device setup request' })
  @IsString()
  @MinLength(1)
  reason!: string;
}
