import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsInt, Max, Min } from "class-validator";
import {
  DISPATCH_ACTIONS,
  WARN_DAYS_MAX,
  WARN_DAYS_MIN,
  type DispatchAction,
} from "../maintenance-settings.repository";

export class UpdateMaintenanceSettingsDto {
  @ApiProperty({ enum: DISPATCH_ACTIONS, example: "warn", description: "What dispatch does when a vehicle has overdue maintenance" })
  @IsIn(DISPATCH_ACTIONS)
  dispatchOverdueAction!: DispatchAction;

  @ApiProperty({ enum: DISPATCH_ACTIONS, example: "allow", description: "What dispatch does when maintenance is due within the warning period" })
  @IsIn(DISPATCH_ACTIONS)
  dispatchDueAction!: DispatchAction;

  @ApiProperty({ minimum: WARN_DAYS_MIN, maximum: WARN_DAYS_MAX, example: 7 })
  @IsInt()
  @Min(WARN_DAYS_MIN)
  @Max(WARN_DAYS_MAX)
  warnDaysBefore!: number;
}
