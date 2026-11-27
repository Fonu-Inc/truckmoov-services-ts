import { ApiProperty, OmitType } from '@nestjs/swagger';
import { StandardApiResponse } from '@shared/openapi';
import { INSTALLATION_ORDER_STATUSES, JOB_EVENT_STAMPS } from '@auth/installation';
import {
  FleetDeviceSchema,
  InstallationFeedbackSchema,
  JobListItemSchema,
  SLOT_END,
  SLOT_START,
} from './installation-response.dto';

const NULLABLE_STRING = { type: String, nullable: true } as const;
const NULLABLE_NUMBER = { type: Number, nullable: true } as const;
const NULLABLE_DATE_TIME = { type: String, format: 'date-time', nullable: true } as const;
const STATUS = { enum: [...INSTALLATION_ORDER_STATUSES] } as const;

export class DashboardCountersSchema {
  @ApiProperty({ description: 'Every job of the installer except offers not yet accepted.' }) total!: number;
  @ApiProperty() completed!: number;
  @ApiProperty({ description: 'total minus completed minus cancelled.' }) pending!: number;
  @ApiProperty({ example: 6, description: 'completed / total as a whole percentage; 0 when total is 0.' })
  successRate!: number;
}

export class DashboardJobSchema {
  @ApiProperty() jobId!: string;
  @ApiProperty({ example: 'FL-2201' }) jobNumber!: string;
  @ApiProperty({ example: 'Eko Haulage Ltd' }) companyName!: string;
  @ApiProperty() siteContactName!: string;
  @ApiProperty() siteContactPhone!: string;
  @ApiProperty({ ...NULLABLE_STRING, description: "The customer's business email." }) siteContactEmail!: string | null;
  @ApiProperty({ example: '3 Creek Road, Apapa' }) address!: string;
  @ApiProperty() city!: string;
  @ApiProperty() state!: string;
  @ApiProperty(SLOT_START) scheduledAt!: string;
  @ApiProperty(SLOT_END) scheduledUntil!: string;
  @ApiProperty(STATUS) status!: string;
}

export class DashboardSectionSchema {
  @ApiProperty({ type: [DashboardJobSchema], description: 'The first 5, soonest first.' }) items!: DashboardJobSchema[];
  @ApiProperty({ description: 'How many match in all.' }) total!: number;
}

export class MonthlyActivitySchema {
  @ApiProperty({ example: '2026-09', description: 'Lagos calendar month.' }) month!: string;
  @ApiProperty({ description: 'Completed in the month (completed_at).' }) completed!: number;
  @ApiProperty({ description: 'Started in the month (started_at).' }) inProgress!: number;
  @ApiProperty({ description: 'Booked for a day in the month, offers aside.' }) scheduled!: number;
}

export class RecentActivitySchema {
  @ApiProperty({ enum: Object.keys(JOB_EVENT_STAMPS) }) type!: string;
  @ApiProperty() jobId!: string;
  @ApiProperty({ example: 'FL-2201' }) jobNumber!: string;
  @ApiProperty({ format: 'date-time' }) occurredAt!: string;
}

export class InstallerDashboardSchema {
  @ApiProperty({ type: DashboardCountersSchema }) counters!: DashboardCountersSchema;
  @ApiProperty({ type: DashboardSectionSchema, description: 'assigned jobs waiting for Accept or Reject.' })
  offers!: DashboardSectionSchema;
  @ApiProperty({ type: DashboardSectionSchema, description: 'scheduled, in_progress, overdue or issue_reported, booked for today in Lagos.' })
  todaysJobs!: DashboardSectionSchema;
  @ApiProperty({ type: DashboardSectionSchema, description: 'scheduled jobs from tomorrow in Lagos.' })
  upcomingJobs!: DashboardSectionSchema;
  @ApiProperty({ type: [MonthlyActivitySchema], description: 'The last 6 Lagos months, oldest first, the current one last.' })
  activityOverTime!: MonthlyActivitySchema[];
  @ApiProperty({ type: [RecentActivitySchema], description: 'The last 10 events, newest first.' })
  recentActivity!: RecentActivitySchema[];
}

export class InstallerDashboardResponse extends StandardApiResponse<InstallerDashboardSchema> {
  @ApiProperty({ type: InstallerDashboardSchema }) data!: InstallerDashboardSchema;
}

export class InstallerJobCountersSchema {
  @ApiProperty({ description: 'Every job of the installer except offers (assigned); overdue included.' }) total!: number;
  @ApiProperty() scheduled!: number;
  @ApiProperty() inProgress!: number;
  @ApiProperty() overdue!: number;
  @ApiProperty() completed!: number;
  @ApiProperty() cancelled!: number;
  @ApiProperty() issueReported!: number;
  @ApiProperty({ description: 'Internal status; a rejected or unassigned job has no installer, so 0 in practice.' })
  unassigned!: number;
}

export class InstallerJobListItemSchema extends OmitType(JobListItemSchema, ['customer', 'location'] as const) {
  @ApiProperty({ example: 'Eko Haulage Ltd', description: 'Organisation name, empty when the application is gone.' })
  companyName!: string;
  @ApiProperty({ example: '3 Creek Road, Apapa' }) address!: string;
  @ApiProperty({ example: 'Apapa' }) city!: string;
  @ApiProperty({ example: 'Lagos' }) state!: string;
}

export class InstallerJobPageSchema {
  @ApiProperty({ type: InstallerJobCountersSchema, description: 'Across every status, whatever the filters.' })
  counters!: InstallerJobCountersSchema;
  @ApiProperty({ type: [InstallerJobListItemSchema] }) items!: InstallerJobListItemSchema[];
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 20 }) limit!: number;
  @ApiProperty() total!: number;
}

export class InstallerJobPageResponse extends StandardApiResponse<InstallerJobPageSchema> {
  @ApiProperty({ type: InstallerJobPageSchema }) data!: InstallerJobPageSchema;
}

export class JobCustomerSchema {
  @ApiProperty() customerName!: string;
  @ApiProperty({ ...NULLABLE_STRING, enum: ['Enterprise', 'Owner operator'] }) customerType!: string | null;
  @ApiProperty() phone!: string;
  @ApiProperty(NULLABLE_STRING) email!: string | null;
  @ApiProperty({ example: '14 Kudirat Abiola Way, Ikeja, Lagos' }) address!: string;
  @ApiProperty({ format: 'date', example: '2026-10-05' }) scheduledDate!: string;
  @ApiProperty(SLOT_START) scheduledAt!: string;
  @ApiProperty(SLOT_END) scheduledUntil!: string;
}

export class JobUnitVehicleSchema {
  @ApiProperty() id!: string;
  @ApiProperty() registrationNumber!: string;
  @ApiProperty() vehicleType!: string;
  @ApiProperty() make!: string;
  @ApiProperty() model!: string;
  @ApiProperty(NULLABLE_NUMBER) year!: number | null;
  @ApiProperty(NULLABLE_STRING) engineNumber!: string | null;
  @ApiProperty(NULLABLE_STRING) chassisNumber!: string | null;
  @ApiProperty(NULLABLE_STRING) colour!: string | null;
  @ApiProperty(NULLABLE_STRING) engineCapacity!: string | null;
  @ApiProperty(NULLABLE_NUMBER) odometer!: number | null;
}

export class JobUnitSimSchema {
  @ApiProperty() iccid!: string;
  @ApiProperty(NULLABLE_STRING) imsi!: string | null;
  @ApiProperty(NULLABLE_STRING) msisdn!: string | null;
  @ApiProperty() carrier!: string;
  @ApiProperty({ example: 'Activated' }) activationStatus!: string;
  @ApiProperty(NULLABLE_STRING) network!: string | null;
}

export class JobUnitSchema {
  @ApiProperty({ example: 1 }) index!: number;
  @ApiProperty({ type: String, nullable: true }) vehicleId!: string | null;
  @ApiProperty({ type: JobUnitVehicleSchema, nullable: true }) vehicle!: JobUnitVehicleSchema | null;
  @ApiProperty({ type: FleetDeviceSchema, nullable: true, description: 'Null until bound, or when fleet cannot answer.' })
  device!: FleetDeviceSchema | null;
  @ApiProperty({ type: JobUnitSimSchema, nullable: true }) sim!: JobUnitSimSchema | null;
}

export class ChecklistItemViewSchema {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty() checked!: boolean;
  @ApiProperty(NULLABLE_DATE_TIME) checkedAt!: string | null;
  @ApiProperty({ required: false, enum: ['device_communicating', 'evidence'] }) gated?: string;
}

export class ChecklistGroupViewSchema {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ type: [ChecklistItemViewSchema] }) items!: ChecklistItemViewSchema[];
}

export class ChecklistViewSchema {
  @ApiProperty({ type: [ChecklistGroupViewSchema] }) groups!: ChecklistGroupViewSchema[];
  @ApiProperty() completed!: number;
  @ApiProperty({ example: 15 }) total!: number;
}

export class EvidenceViewSchema {
  @ApiProperty() id!: string;
  @ApiProperty() category!: string;
  @ApiProperty(NULLABLE_STRING) vehicleId!: string | null;
  @ApiProperty() label!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty() size!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class EvidenceLinkSchema extends EvidenceViewSchema {
  @ApiProperty({ description: 'Short-lived download link' }) url!: string;
}

export class EvidenceUploadResponse extends StandardApiResponse<EvidenceViewSchema> {
  @ApiProperty({ type: EvidenceViewSchema }) data!: EvidenceViewSchema;
}

export class EvidenceLinkResponse extends StandardApiResponse<EvidenceLinkSchema> {
  @ApiProperty({ type: EvidenceLinkSchema }) data!: EvidenceLinkSchema;
}

export class CompletionViewSchema {
  @ApiProperty() customer!: string;
  @ApiProperty(NULLABLE_STRING) vehicle!: string | null;
  @ApiProperty(NULLABLE_STRING) device!: string | null;
  @ApiProperty({ type: [String] }) vehicles!: string[];
  @ApiProperty({ type: [String] }) devices!: string[];
  @ApiProperty({ format: 'date', description: 'Lagos day completed, else the booked day.' }) installationDate!: string;
  @ApiProperty() installer!: string;
  @ApiProperty({ example: '15/15' }) checklist!: string;
  @ApiProperty() evidenceCount!: number;
  @ApiProperty(NULLABLE_STRING) notes!: string | null;
}

export class JobActionsSchema {
  @ApiProperty({ description: 'The job is an offer: Accept and Reject both apply.' }) canAccept!: boolean;
  @ApiProperty() canStart!: boolean;
  @ApiProperty() canComplete!: boolean;
  @ApiProperty() canEditNotes!: boolean;
  @ApiProperty() canUploadEvidence!: boolean;
  @ApiProperty() canTick!: boolean;
}

export class JobIssueViewSchema {
  @ApiProperty() ticketId!: string;
  @ApiProperty({ example: '#tkt-12' }) displayId!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class InstallerJobDetailSchema {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'FL-0042' }) jobNumber!: string;
  @ApiProperty(STATUS) status!: string;
  @ApiProperty({ type: JobCustomerSchema }) customer!: JobCustomerSchema;
  @ApiProperty({ type: [JobUnitSchema] }) units!: JobUnitSchema[];
  @ApiProperty({ type: ChecklistViewSchema }) checklist!: ChecklistViewSchema;
  @ApiProperty({ type: [EvidenceViewSchema] }) evidence!: EvidenceViewSchema[];
  @ApiProperty(NULLABLE_STRING) notes!: string | null;
  @ApiProperty({ type: CompletionViewSchema }) completion!: CompletionViewSchema;
  @ApiProperty({ type: JobActionsSchema }) actions!: JobActionsSchema;
  @ApiProperty({ type: [JobIssueViewSchema] }) issues!: JobIssueViewSchema[];
  @ApiProperty({ type: InstallationFeedbackSchema, nullable: true, description: "The customer's rating once the job is completed." })
  feedback!: InstallationFeedbackSchema | null;
}

export class InstallerJobDetailResponse extends StandardApiResponse<InstallerJobDetailSchema> {
  @ApiProperty({ type: InstallerJobDetailSchema }) data!: InstallerJobDetailSchema;
}

export class RejectedOfferSchema {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'FL-0042' }) jobNumber!: string;
  @ApiProperty({ format: 'date-time' }) rejectedAt!: string;
}

export class RejectedOfferResponse extends StandardApiResponse<RejectedOfferSchema> {
  @ApiProperty({ type: RejectedOfferSchema }) data!: RejectedOfferSchema;
}

export class OptionItemSchema {
  @ApiProperty() key!: string;
  @ApiProperty() label!: string;
}

export class ChecklistDefinitionItemSchema extends OptionItemSchema {
  @ApiProperty({ required: false, enum: ['device_communicating', 'evidence'] }) gated?: string;
}

export class ChecklistDefinitionGroupSchema extends OptionItemSchema {
  @ApiProperty({ type: [ChecklistDefinitionItemSchema] }) items!: ChecklistDefinitionItemSchema[];
}

export class SupportCategoryOptionSchema extends OptionItemSchema {
  @ApiProperty() description!: string;
  @ApiProperty({ type: [OptionItemSchema], description: '"What is happening" choices; empty for most categories.' })
  chips!: OptionItemSchema[];
}

export class InstallerOptionsSchema {
  @ApiProperty({ type: [ChecklistDefinitionGroupSchema] }) checklist!: ChecklistDefinitionGroupSchema[];
  @ApiProperty({ type: [OptionItemSchema] }) evidenceCategories!: OptionItemSchema[];
  @ApiProperty({ type: [SupportCategoryOptionSchema] }) supportCategories!: SupportCategoryOptionSchema[];
  @ApiProperty({ type: [String] }) fieldTips!: string[];
  @ApiProperty({ type: [OptionItemSchema] }) priorities!: OptionItemSchema[];
  @ApiProperty({ type: [OptionItemSchema] }) ticketStatuses!: OptionItemSchema[];
}

export class InstallerOptionsResponse extends StandardApiResponse<InstallerOptionsSchema> {
  @ApiProperty({ type: InstallerOptionsSchema }) data!: InstallerOptionsSchema;
}
