import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Unified OTP/SMS request. Same fields as Fonu's `/otp/send`, narrowed to the
 * SMS channel. `otp` is required for a verification code; `message` alone is
 * allowed for a plain SMS.
 */
export class SendOtpDto {
  @ApiProperty({ enum: ['sms'], example: 'sms' })
  @IsIn(['sms'])
  channel!: 'sms';

  @ApiProperty({
    description: 'Destination phone number (E.164, e.g. +2347043863010)',
    example: '+2347043863010',
  })
  @IsString()
  @IsNotEmpty()
  to!: string;

  @ApiPropertyOptional({
    description: 'The one-time code to deliver. You generate and store it.',
    example: '123456',
  })
  @IsOptional()
  @IsString()
  otp?: string;

  @ApiPropertyOptional({
    description:
      'SMS only: an approved sender ID. Defaults to the configured sender mask.',
  })
  @IsOptional()
  @IsString()
  senderId?: string;

  @ApiPropertyOptional({
    description:
      'SMS text. Use the {{otp}} placeholder to position the code. Required when otp is omitted.',
  })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({
    description:
      'Optional scope for duplicate-OTP suppression. Use the application id so two applicants sharing a number each get a code.',
  })
  @IsOptional()
  @IsString()
  dedupKey?: string;
}
