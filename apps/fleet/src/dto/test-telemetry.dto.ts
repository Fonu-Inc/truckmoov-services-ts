import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { TEST_TELEMETRY_IMEI } from '@shared/devices';

export class TestTelemetryDto {
  @ApiProperty({ example: '359779090012345' })
  @IsString()
  @Matches(TEST_TELEMETRY_IMEI, { message: 'imei must be 15 digits' })
  imei!: string;

  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}
