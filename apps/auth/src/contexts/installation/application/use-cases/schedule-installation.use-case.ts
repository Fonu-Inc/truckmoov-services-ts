import { Inject, Injectable, Logger } from '@nestjs/common';
import { ID_GENERATOR, type IdGenerator } from '@auth/session/domain/ports/id-generator.port';
import {
  ONBOARDING_APPLICATION_REPOSITORY,
  type OnboardingApplicationRepository,
  type StoredOnboardingApplication,
} from '@auth/onboarding/domain/onboarding-application.repository';
import { requestedDeviceCount } from '@auth/onboarding/domain/onboarding-application.support';
import {
  validateCity,
  validateContactFullName,
  validateNigerianPhone,
  validateState,
  validateStreetAddress,
  OnboardingValidationError,
} from '@auth/onboarding/domain/onboarding-application.validation';
import { assertStageAdvance } from '@auth/onboarding/domain/onboarding-stage';
import { GetOnboardingApplicationUseCase } from '@auth/onboarding/application/use-cases/get-onboarding-application.use-case';
import {
  INSTALLATION_ORDER_REPOSITORY,
  type InstallationOrderRepository,
  type StoredDeviceAssignment,
  type StoredInstallationOrder,
} from '@auth/installation/domain/installation-order.repository';
import {
  assertAssignments,
  assertSchedulable,
  bookingDay,
  INSTALLATION_SLOT_LABELS,
  INSTALLATION_TIME_SLOTS,
  type DeviceAssignmentInput,
  type InstallationTimeSlot,
} from '@auth/installation/domain/installation-order';
import {
  isInstallerCapability,
  type InstallerCapability,
} from '@auth/installation/domain/installer';
import { IssueSetupLinkUseCase } from './issue-setup-link.use-case';
import { InstallerAssignmentService } from '../services/installer-assignment.service';
import { InstallerNotifier, assignedNotice } from '../services/installer-notifier.service';

export class InstallationNotSchedulableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InstallationNotSchedulableError';
  }
}

@Injectable()
export class ScheduleInstallationUseCase {
  private readonly logger = new Logger(ScheduleInstallationUseCase.name);

  constructor(
    @Inject(ONBOARDING_APPLICATION_REPOSITORY)
    private readonly applications: OnboardingApplicationRepository,
    @Inject(INSTALLATION_ORDER_REPOSITORY)
    private readonly orders: InstallationOrderRepository,
    @Inject(InstallerAssignmentService)
    private readonly assignment: InstallerAssignmentService,
    @Inject(GetOnboardingApplicationUseCase)
    private readonly getApplication: GetOnboardingApplicationUseCase,
    @Inject(IssueSetupLinkUseCase)
    private readonly issueSetupLink: IssueSetupLinkUseCase,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(InstallerNotifier) private readonly notifier: InstallerNotifier,
  ) {}

  async execute(input: {
    applicationId: string;
    applicationToken: string;
    scheduledDate: unknown;
    timeSlot: unknown;
    addressLine: unknown;
    city: unknown;
    state: unknown;
    siteContactName: unknown;
    siteContactPhone: unknown;
    notes?: unknown;
    requiredCapabilities?: unknown;
    assignments: DeviceAssignmentInput[];
  }) {
    const application = await this.getApplication.resolve(
      input.applicationId,
      input.applicationToken,
    );

    // The body is checked before the stage, so a malformed request is a 400 at
    // any stage. Checked the other way round, every body, good or bad, got the
    // same 409 until the application reached this step, which hid all of them.
    const fields = await this.validate(input, application);
    await this.assertBookable(application);
    const tenantId = application.tenantId as string;

    const now = new Date();
    const booked: StoredInstallationOrder = {
      id: this.idGenerator.generate(),
      orderNumber: await this.orders.nextOrderNumber(),
      applicationId: application.id,
      tenantId,
      ...fields,
      installerNotes: null,
      installerId: null,
      status: 'unassigned',
      preExceptionStatus: null,
      assignedAt: null,
      acceptedAt: null,
      startedAt: null,
      issueReportedAt: null,
      completedAt: null,
      cancelledAt: null,
      reminderSentAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.orders.save(booked);
    // Assignment is attempted immediately rather than left to the sweep: the
    // applicant is shown who is coming.
    const assignment = await (await this.assignment.assigner())(booked, now);
    const order = assignment?.order ?? booked;
    const installer = assignment?.installer ?? null;

    await this.orders.replaceAssignments(
      order.id,
      input.assignments.map<StoredDeviceAssignment>((assignment) => ({
        id: this.idGenerator.generate(),
        orderId: order.id,
        deviceIndex: assignment.deviceIndex,
        vehicleId: assignment.vehicleId,
        fleetDeviceId: null,
        createdAt: now,
      })),
    );

    await this.advance(application, now);

    // The account comes into existence here, not at approval: there is nothing
    // for a customer to log in and do until an installation is booked.
    const setupLink = await this.issueSetupLink.execute(application);
    if (assignment) await this.notifier.notify(assignedNotice(order, now));

    this.logger.log(
      `installation_scheduled:${order.orderNumber}:installer=${installer?.id ?? 'unassigned'}`,
    );

    return {
      status: true,
      message: installer
        ? 'Installation scheduled and an installer assigned'
        : 'Installation scheduled, an installer will be assigned shortly',
      data: {
        orderNumber: order.orderNumber,
        scheduledDate: fields.scheduledDate.toISOString().slice(0, 10),
        timeSlot: order.timeSlot,
        timeSlotLabel: INSTALLATION_SLOT_LABELS[order.timeSlot],
        status: order.status,
        installer: installer
          ? {
              fullName: installer.fullName,
              team: installer.team,
              phoneNumber: installer.phoneNumber,
              email: installer.email,
            }
          : null,
        setupLinkSent: setupLink.delivered,
      },
    };
  }

  /** Everything in the request that can be wrong, in the order a form shows it. */
  private async validate(
    input: Parameters<ScheduleInstallationUseCase['execute']>[0],
    application: StoredOnboardingApplication,
  ) {
    const scheduledDate = bookingDay(input.scheduledDate);
    assertSchedulable(scheduledDate);

    const [deviceRequests, vehicles] = await Promise.all([
      this.applications.findDeviceRequestsByApplicationId(application.id),
      this.applications.findVehiclesByApplicationId(application.id),
    ]);
    assertAssignments(
      input.assignments,
      requestedDeviceCount(deviceRequests),
      new Set(vehicles.map((vehicle) => vehicle.id)),
    );

    return {
      scheduledDate,
      timeSlot: validateTimeSlot(input.timeSlot),
      addressLine: validateStreetAddress(input.addressLine),
      city: validateCity(input.city),
      state: validateState(input.state),
      requiredCapabilities: validateRequiredCapabilities(input.requiredCapabilities),
      siteContactName: validateContactFullName(input.siteContactName),
      siteContactPhone: validateNigerianPhone(input.siteContactPhone, 'siteContactPhone'),
      notes: validateNotes(input.notes),
    };
  }

  private async assertBookable(application: StoredOnboardingApplication): Promise<void> {
    if (application.stage !== 'installation_scheduling') {
      throw new InstallationNotSchedulableError(
        `An onboarding at the ${application.stage} stage cannot be scheduled`,
      );
    }
    if (!application.tenantId) {
      throw new InstallationNotSchedulableError('This application has no tenant yet');
    }
    if (await this.orders.findByApplicationId(application.id)) {
      throw new InstallationNotSchedulableError('An installation is already scheduled');
    }
  }

  private async advance(
    application: StoredOnboardingApplication,
    now: Date,
  ): Promise<void> {
    assertStageAdvance(application.stage, 'installation');
    await this.applications.save({
      ...application,
      stage: 'installation',
      updatedAt: now,
    });
  }
}

function validateRequiredCapabilities(value: unknown): InstallerCapability[] {
  if (value === undefined) return ['device_installation'];
  if (!Array.isArray(value) || value.length === 0) {
    throw new OnboardingValidationError('requiredCapabilities', 'At least one required capability is needed');
  }
  const capabilities = value.map((item) => (typeof item === 'string' ? item.trim() : ''));
  const unknown = capabilities.filter((capability) => !isInstallerCapability(capability));
  if (unknown.length) {
    throw new OnboardingValidationError('requiredCapabilities', `Unknown capabilities: ${unknown.join(', ')}`);
  }
  return [...new Set(capabilities)] as InstallerCapability[];
}

export function validateTimeSlot(value: unknown): InstallationTimeSlot {
  const candidate = String(value ?? '').trim().toLowerCase();
  if (!(INSTALLATION_TIME_SLOTS as readonly string[]).includes(candidate)) {
    throw new OnboardingValidationError(
      'timeSlot',
      `Time slot must be one of: ${INSTALLATION_TIME_SLOTS.join(', ')}`,
    );
  }
  return candidate as InstallationTimeSlot;
}

function validateNotes(value: unknown): string | null {
  const notes = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (notes.length === 0) return null;
  if (notes.length > 1000) {
    throw new OnboardingValidationError(
      'notes',
      'Installation notes must be 1000 characters or fewer',
    );
  }
  return notes;
}
