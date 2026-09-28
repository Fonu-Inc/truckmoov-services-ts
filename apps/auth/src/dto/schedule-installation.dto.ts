import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Allow } from 'class-validator';
import { INSTALLATION_TIME_SLOTS, INSTALLER_CAPABILITIES } from '@auth/installation';

export class DeviceAssignmentDto {
  @Allow()
  @ApiProperty({ example: 1, description: 'The device position on the order.' })
  deviceIndex!: number;

  @Allow()
  @ApiProperty({ description: 'A vehicle on this application.' })
  vehicleId!: string;
}

// @Allow only whitelists each field for the global ValidationPipe. Enforcement
// lives in the installation domain, which the use case calls directly.
export class ScheduleInstallationDto {
  @Allow()
  @ApiProperty({ example: '2026-10-05', description: 'At least one day ahead.' })
  scheduledDate!: string;

  @Allow()
  @ApiProperty({ enum: [...INSTALLATION_TIME_SLOTS] })
  timeSlot!: string;

  @Allow()
  @ApiProperty({ example: '12 Mazi Fedelis Street', maxLength: 200 })
  addressLine!: string;

  @Allow()
  @ApiProperty({ example: 'Lagos', maxLength: 80 })
  city!: string;

  @Allow()
  @ApiProperty({ example: 'Lagos', description: 'A Nigerian state or FCT.' })
  state!: string;

  @Allow()
  @ApiProperty({ example: 'Victor Akaaha', maxLength: 80 })
  siteContactName!: string;

  @Allow()
  @ApiProperty({ example: '+234 704 138 6799' })
  siteContactPhone!: string;

  @Allow()
  @ApiPropertyOptional({ maxLength: 1000 })
  notes?: string;

  @Allow()
  @ApiPropertyOptional({
    enum: Object.keys(INSTALLER_CAPABILITIES),
    isArray: true,
    description: 'Closed capability catalogue needed for this installation. Defaults to device installation.',
  })
  requiredCapabilities?: string[];

  @Allow()
  @ApiProperty({
    type: [DeviceAssignmentDto],
    description: 'One entry per paid-for device.',
  })
  assignments!: DeviceAssignmentDto[];
}
