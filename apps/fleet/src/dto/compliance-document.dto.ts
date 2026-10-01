import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEmail, IsIn, IsISO8601, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";
import { REMINDER_LEAD_DAY_OPTIONS } from "../contexts/fleet/maintenance/domain/maintenance-reminder-schedule.repository";

export class CreateComplianceDocumentDto {
  @ApiPropertyOptional({ nullable: true, description: "Vehicle the document belongs to, if any" })
  @IsOptional()
  @IsString()
  vehicleId?: string | null;

  @ApiProperty({ description: "Document category (e.g. roadworthiness, insurance)" })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  documentType!: string;

  @ApiProperty({ description: "Display name of the document" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  documentName!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601()
  issueDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsISO8601()
  expiryDate?: string | null;

  @ApiPropertyOptional({ description: "Days before expiry to start reminding (defaults to 30)" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reminderDays?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  fileUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fileSize?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class UpdateComplianceDocumentDto extends PartialType(CreateComplianceDocumentDto) {}

export class UploadComplianceDocumentDto {
  @ApiProperty({ description: "Stored file URL" })
  @IsString()
  @MinLength(1)
  fileUrl!: string;

  @ApiPropertyOptional({ description: "File size in bytes" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fileSize?: number;
}

export class RenewComplianceDocumentDto {
  @ApiPropertyOptional({ description: "New expiry date; defaults to +1 year from current expiry" })
  @IsOptional()
  @IsISO8601()
  expiryDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fileSize?: number;
}

export class SetComplianceReminderDto {
  @ApiProperty({ description: "Days before expiry to start reminding" })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reminderDays!: number;
}

export class SendComplianceRemindersDto {
  @ApiProperty({ example: "manager@company.com" })
  @IsEmail()
  recipientEmail!: string;

  @ApiPropertyOptional({ enum: REMINDER_LEAD_DAY_OPTIONS, default: 30, description: "Remind about documents expiring within this many days, and any already expired." })
  @IsOptional()
  @Type(() => Number)
  @IsIn(REMINDER_LEAD_DAY_OPTIONS as unknown as number[])
  leadDays?: number;
}
