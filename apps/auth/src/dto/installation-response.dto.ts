import { ApiProperty } from '@nestjs/swagger';
import { StandardApiResponse } from '@shared/openapi';
import { INSTALLATION_ORDER_STATUSES, INSTALLATION_TIME_SLOTS } from '@auth/installation';
import { StageProgressSchema } from './onboarding-review-response.dto';

const NULLABLE_STRING = { type: String, nullable: true } as const;
const NULLABLE_DATE_TIME = { type: String, format: 'date-time', nullable: true } as const;
const BOOKING_DAY = { format: 'date', example: '2026-10-05' } as const;
const SLOT_LABEL = { example: 'Morning (8:00 – 12:00)' } as const;

export class InstallerContactSchema {
  @ApiProperty() fullName!: string;
  @ApiProperty() team!: string;
  @ApiProperty() phoneNumber!: string;
  @ApiProperty() email!: string;
}

export class ScheduledInstallationSchema {
  @ApiProperty({ example: 'FL-0042' }) orderNumber!: string;
  @ApiProperty(BOOKING_DAY) scheduledDate!: string;
  @ApiProperty({ enum: [...INSTALLATION_TIME_SLOTS] }) timeSlot!: string;
  @ApiProperty(SLOT_LABEL) timeSlotLabel!: string;
  @ApiProperty({
    enum: [...INSTALLATION_ORDER_STATUSES],
    description: 'unassigned, or assigned when an installer was found at once.',
  })
  status!: string;
  @ApiProperty({ type: InstallerContactSchema, nullable: true })
  installer!: InstallerContactSchema | null;
  @ApiProperty({ description: 'Whether the account setup email was accepted for delivery.' })
  setupLinkSent!: boolean;
}

export class ScheduledInstallationResponse extends StandardApiResponse<ScheduledInstallationSchema> {
  @ApiProperty({ type: ScheduledInstallationSchema }) data!: ScheduledInstallationSchema;
}

export class InstallationOrderStatusSchema {
  @ApiProperty({ example: 'FL-0042' }) orderNumber!: string;
  @ApiProperty(BOOKING_DAY) scheduledDate!: string;
  @ApiProperty({ enum: [...INSTALLATION_TIME_SLOTS] }) timeSlot!: string;
  @ApiProperty(SLOT_LABEL) timeSlotLabel!: string;
  @ApiProperty({ example: '12 Mazi Fedelis Street, Ikeja, Lagos' }) location!: string;
  @ApiProperty() siteContactName!: string;
  @ApiProperty() siteContactPhone!: string;
  @ApiProperty(NULLABLE_STRING) notes!: string | null;
  @ApiProperty({ enum: [...INSTALLATION_ORDER_STATUSES] }) status!: string;
  @ApiProperty(NULLABLE_DATE_TIME) completedAt!: string | null;
  @ApiProperty() deviceCount!: number;
}

export class AssignedInstallerSchema extends InstallerContactSchema {
  @ApiProperty(NULLABLE_STRING) photoUrl!: string | null;
}

export class DeviceAssignmentViewSchema {
  @ApiProperty({ example: 1 }) deviceIndex!: number;
  @ApiProperty() vehicleId!: string;
}

export class InstallationStatusSchema {
  @ApiProperty({
    type: InstallationOrderStatusSchema,
    nullable: true,
    description: 'Null, with every other field empty, when nothing is booked.',
  })
  order!: InstallationOrderStatusSchema | null;
  @ApiProperty({ type: AssignedInstallerSchema, nullable: true })
  installer!: AssignedInstallerSchema | null;
  @ApiProperty({ type: [DeviceAssignmentViewSchema] })
  assignments!: DeviceAssignmentViewSchema[];
  @ApiProperty({ type: [StageProgressSchema] }) progress!: StageProgressSchema[];
}

export class InstallationStatusResponse extends StandardApiResponse<InstallationStatusSchema> {
  @ApiProperty({ type: InstallationStatusSchema }) data!: InstallationStatusSchema;
}

export class SilentDeviceSchema {
  @ApiProperty() deviceId!: string;
  @ApiProperty(NULLABLE_STRING) imei!: string | null;
  @ApiProperty({ example: 'Teltonika FMB920', description: 'Empty when the device was not found.' })
  model!: string;
  @ApiProperty(NULLABLE_STRING) vehicleId!: string | null;
  @ApiProperty(NULLABLE_DATE_TIME) lastSeen!: string | null;
  @ApiProperty({ example: 'No signal received yet' }) reason!: string;
}

export class InstallationConfirmationSchema {
  @ApiProperty({ example: 'FL-0042' }) orderNumber!: string;
  @ApiProperty({
    enum: ['connectivity_verification', 'fleet_ready'],
    description: 'fleet_ready once every device reports; otherwise still connectivity_verification.',
  })
  stage!: string;
  @ApiProperty() devicesChecked!: number;
  @ApiProperty() devicesReporting!: number;
  @ApiProperty({ type: [SilentDeviceSchema] }) failures!: SilentDeviceSchema[];
}

export class InstallationConfirmationResponse extends StandardApiResponse<InstallationConfirmationSchema> {
  @ApiProperty({ type: InstallationConfirmationSchema }) data!: InstallationConfirmationSchema;
}

export class JobVehicleSummarySchema {
  @ApiProperty() registrationNumber!: string;
  @ApiProperty() make!: string;
  @ApiProperty() model!: string;
}

export class JobDeviceSummarySchema {
  @ApiProperty() manufacturer!: string;
  @ApiProperty() model!: string;
}

export class JobLocationSchema {
  @ApiProperty() city!: string;
  @ApiProperty() state!: string;
}

export class JobInstallerSummarySchema {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() fullName!: string;
}

export class JobIssueTicketSchema {
  @ApiProperty() id!: string;
  @ApiProperty({ example: '#tkt-12' }) displayId!: string;
}

export class InstallationJobListItemSchema {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'FL-0042' }) jobNumber!: string;
  @ApiProperty({ description: 'Organisation name, empty when the application is gone.' })
  customer!: string;
  @ApiProperty({ type: JobVehicleSummarySchema, nullable: true })
  firstVehicle!: JobVehicleSummarySchema | null;
  @ApiProperty({ type: JobDeviceSummarySchema, nullable: true })
  firstDevice!: JobDeviceSummarySchema | null;
  @ApiProperty({ type: JobLocationSchema }) location!: JobLocationSchema;
  @ApiProperty() vehicleCount!: number;
  @ApiProperty() deviceCount!: number;
  @ApiProperty(BOOKING_DAY) scheduledDate!: string;
  @ApiProperty({ enum: [...INSTALLATION_TIME_SLOTS] }) timeSlot!: string;
  @ApiProperty(SLOT_LABEL) timeSlotLabel!: string;
  @ApiProperty({ enum: [...INSTALLATION_ORDER_STATUSES] }) status!: string;
  @ApiProperty({ ...NULLABLE_DATE_TIME, description: 'When it was completed or cancelled.' })
  completedAt!: string | null;
  @ApiProperty() tenantId!: string;
  @ApiProperty({ type: JobInstallerSummarySchema, nullable: true })
  installer!: JobInstallerSummarySchema | null;
  @ApiProperty({
    type: JobIssueTicketSchema,
    nullable: true,
    description: 'The newest issue report, only while the job is issue_reported.',
  })
  issueTicket!: JobIssueTicketSchema | null;
}

export class InstallationJobPageSchema {
  @ApiProperty({ type: [InstallationJobListItemSchema] })
  items!: InstallationJobListItemSchema[];
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 20, description: 'At most 100.' }) limit!: number;
  @ApiProperty() total!: number;
}

export class InstallationJobPageResponse extends StandardApiResponse<InstallationJobPageSchema> {
  @ApiProperty({ type: InstallationJobPageSchema }) data!: InstallationJobPageSchema;
}

export class InstallationJobChangeSchema {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'FL-0042' }) jobNumber!: string;
  @ApiProperty({ enum: [...INSTALLATION_ORDER_STATUSES] }) status!: string;
}

export class InstallationJobChangeResponse extends StandardApiResponse<InstallationJobChangeSchema> {
  @ApiProperty({ type: InstallationJobChangeSchema }) data!: InstallationJobChangeSchema;
}

export class FleetDeviceSchema {
  @ApiProperty() id!: string;
  @ApiProperty(NULLABLE_STRING) name!: string | null;
  @ApiProperty() imei!: string;
  @ApiProperty() manufacturer!: string;
  @ApiProperty() model!: string;
  @ApiProperty() status!: string;
  @ApiProperty() statusLabel!: string;
  @ApiProperty(NULLABLE_STRING) deviceType!: string | null;
  @ApiProperty({
    ...NULLABLE_STRING,
    description: 'waiting, verified or failed; null before verification ever started.',
  })
  verificationStatus!: string | null;
}

export class BoundUnitSchema {
  @ApiProperty({ example: 1 }) index!: number;
  @ApiProperty() vehicleId!: string;
  @ApiProperty({ type: FleetDeviceSchema }) device!: FleetDeviceSchema;
}

export class BoundUnitResponse extends StandardApiResponse<BoundUnitSchema> {
  @ApiProperty({ type: BoundUnitSchema }) data!: BoundUnitSchema;
}
