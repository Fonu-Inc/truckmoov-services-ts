import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { INSTALLATION_TIME_SLOTS } from '@auth/installation';

export class DeviceAssignmentDto {
  @ApiProperty({ example: 1, description: 'The device position on the order.' })
  deviceIndex!: number;

  @ApiProperty({ description: 'A vehicle on this application.' })
  vehicleId!: string;
}

// Shapes the OpenAPI contract only. Enforcement lives in the installation
// domain, which the use case calls directly.
export class ScheduleInstallationDto {
  @ApiProperty({ example: '2026-10-05', description: 'At least one day ahead.' })
  scheduledDate!: string;

  @ApiProperty({ enum: [...INSTALLATION_TIME_SLOTS] })
  timeSlot!: string;

  @ApiProperty({ example: '12 Mazi Fedelis Street', maxLength: 200 })
  addressLine!: string;

  @ApiProperty({ example: 'Lagos', maxLength: 80 })
  city!: string;

  @ApiProperty({ example: 'Lagos', description: 'A Nigerian state or FCT.' })
  state!: string;

  @ApiProperty({ example: 'Victor Akaaha', maxLength: 80 })
  siteContactName!: string;

  @ApiProperty({ example: '+234 704 138 6799' })
  siteContactPhone!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  notes?: string;

  @ApiProperty({
    type: [DeviceAssignmentDto],
    description: 'One entry per paid-for device.',
  })
  assignments!: DeviceAssignmentDto[];
}
