import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsEmail, IsIn, IsOptional } from "class-validator";
import { Type } from "class-transformer";
import { REMINDER_LEAD_DAY_OPTIONS } from "../contexts/fleet/maintenance/domain/maintenance-reminder-schedule.repository";

export class SaveMaintenanceReminderScheduleDto {
  @ApiProperty({ example: "manager@company.com" })
  @IsEmail()
  recipientEmail!: string;

  @ApiProperty({ enum: REMINDER_LEAD_DAY_OPTIONS, example: 30 })
  @Type(() => Number)
  @IsIn(REMINDER_LEAD_DAY_OPTIONS as unknown as number[])
  leadDays!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
