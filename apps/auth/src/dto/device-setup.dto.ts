import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ApproveDeviceSetupRequestDto {
  @ApiPropertyOptional({ description: 'Optional note recorded on the request timeline' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class AssignDeviceSetupRequestDto {
  @ApiProperty({ description: 'Id of the active installer who will fit the devices' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  installerId!: string;
}

export class ConfirmDeviceSetupPaymentDto {
  @ApiPropertyOptional({ description: 'Optional note recorded on the request timeline, such as the payment reference' })
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
