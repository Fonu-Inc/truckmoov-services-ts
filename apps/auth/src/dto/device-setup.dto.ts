import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ApproveDeviceSetupRequestDto {
  @ApiPropertyOptional({ description: 'Optional note recorded on the request timeline' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class RejectDeviceSetupRequestDto {
  @ApiProperty({ description: 'Reason for rejecting the device setup request' })
  @IsString()
  @MinLength(1)
  reason!: string;
}

export class SuspendSystemDeviceDto {
  @ApiPropertyOptional({ description: 'Why the device is being taken out of service' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
