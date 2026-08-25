import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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

export class OutgoingAttachmentDto {
  @IsString()
  @MaxLength(255)
  filename!: string;

  @IsString()
  @MaxLength(255)
  contentType!: string;

  /** Base64. The whole message is held in memory while it is composed. */
  @IsString()
  content!: string;
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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OutgoingAttachmentDto)
  attachments?: OutgoingAttachmentDto[];
}
