import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RejectSimRequestDto {
  @ApiProperty({ description: 'Reason for rejecting the SIM request' })
  @IsString()
  @MinLength(1)
  reason!: string;
}
