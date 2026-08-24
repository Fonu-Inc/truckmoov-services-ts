import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class MailServerDto {
  @IsString()
  @MaxLength(255)
  host!: string;

  @IsInt()
  port!: number;

  @IsString()
  @MaxLength(255)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  password!: string;

  @IsOptional()
  @IsBoolean()
  secure?: boolean;
}

export class SaveMailCredentialsDto {
  @IsEmail()
  emailAddress!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string;

  @ValidateNested()
  @Type(() => MailServerDto)
  imap!: MailServerDto;

  @ValidateNested()
  @Type(() => MailServerDto)
  smtp!: MailServerDto;
}
