import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateMessageFlagsDto {
  @IsOptional()
  @IsBoolean()
  starred?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  addLabels?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  removeLabels?: string[];
}
