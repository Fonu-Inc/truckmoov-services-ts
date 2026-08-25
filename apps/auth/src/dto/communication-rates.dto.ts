import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { COMMUNICATION_CHANNELS } from '../communication-rates.repository';

export class ChannelRateDto {
  @IsIn([...COMMUNICATION_CHANNELS])
  channel!: string;

  /** Kobo, so a sub-Naira rate is expressible without floating point. */
  @IsInt()
  @Min(1)
  rateKobo!: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

export class UpdateCommunicationRatesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChannelRateDto)
  rates!: ChannelRateDto[];
}
