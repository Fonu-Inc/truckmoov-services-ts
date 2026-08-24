import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class MailAddressDto {
  @IsEmail()
  address!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string | null;
}

export class SendMailDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MailAddressDto)
  to!: MailAddressDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MailAddressDto)
  cc?: MailAddressDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MailAddressDto)
  bcc?: MailAddressDto[];

  @IsString()
  @MaxLength(998)
  subject!: string;

  @IsOptional()
  @IsString()
  bodyText?: string;

  @IsOptional()
  @IsString()
  bodyHtml?: string;

  @IsOptional()
  @IsString()
  replyToThreadId?: string;
}
