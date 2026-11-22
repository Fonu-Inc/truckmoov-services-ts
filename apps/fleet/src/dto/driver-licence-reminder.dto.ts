import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEmail, IsIn } from "class-validator";
import { StandardApiResponse } from "@shared/openapi";
import { REMINDER_LEAD_DAY_OPTIONS } from "../contexts/fleet/maintenance/domain/maintenance-reminder-schedule.repository";

export class SetDriverLicenceReminderDto {
  @ApiProperty({ example: "manager@company.com" })
  @IsEmail()
  recipientEmail!: string;

  @ApiProperty({ enum: REMINDER_LEAD_DAY_OPTIONS, example: 30, description: "Mail this many days before the licence expires" })
  @Type(() => Number)
  @IsIn(REMINDER_LEAD_DAY_OPTIONS as unknown as number[])
  leadDays!: number;
}

export class DriverLicenceReminderSchema {
  @ApiProperty() driverId!: string;
  @ApiProperty() recipientEmail!: string;
  @ApiProperty({ enum: REMINDER_LEAD_DAY_OPTIONS }) leadDays!: number;
  @ApiProperty({ type: String, nullable: true, description: "The expiry date the last mail was about" }) lastSentForExpiry!: string | null;
  @ApiProperty() updatedAt!: string;
}

export class DriverLicenceReminderResponse extends StandardApiResponse<DriverLicenceReminderSchema> {
  @ApiProperty({ type: DriverLicenceReminderSchema }) data!: DriverLicenceReminderSchema;
}

export class DriverLicenceReminderListResponse extends StandardApiResponse<DriverLicenceReminderSchema[]> {
  @ApiProperty({ type: [DriverLicenceReminderSchema] }) data!: DriverLicenceReminderSchema[];
}
