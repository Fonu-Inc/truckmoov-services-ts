import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from "class-validator";

const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateDispatcherPreferencesDto {
  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  @Matches(HHMM_PATTERN, { message: "shiftStart must be in HH:MM format" })
  shiftStart?: string;

  @IsOptional()
  @IsString()
  @Matches(HHMM_PATTERN, { message: "shiftEnd must be in HH:MM format" })
  shiftEnd?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  workDays?: number[];
}
