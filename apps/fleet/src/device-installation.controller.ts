import { Body, Controller, Get, Inject, NotFoundException, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { Role, Roles, RolesGuard } from "@shared/rbac";
import { AuditLogService } from "./audit-log.service";
import { BaseFleetController, type FleetRequestContext } from "./base.controller";
import { BulkConfigureDevicesUseCase } from "./contexts/fleet/devices/application/use-cases/bulk-configure-devices.use-case";
import { ConfigureDeviceUseCase } from "./contexts/fleet/devices/application/use-cases/configure-device.use-case";
import { GetDeviceDiagnosticsUseCase } from "./contexts/fleet/devices/application/use-cases/get-device-diagnostics.use-case";
import { GetInstallationQueueUseCase, toQueueRow } from "./contexts/fleet/devices/application/use-cases/get-installation-queue.use-case";
import { GetInstallerGuideUseCase } from "./contexts/fleet/devices/application/use-cases/get-installer-guide.use-case";
import { GetVerificationMonitorUseCase } from "./contexts/fleet/devices/application/use-cases/get-verification-monitor.use-case";
import { RecordVerificationFailureUseCase } from "./contexts/fleet/devices/application/use-cases/record-verification-failure.use-case";
import { StartDeviceVerificationUseCase } from "./contexts/fleet/devices/application/use-cases/start-device-verification.use-case";
import { DEVICE_REPOSITORY, type DeviceRepository } from "./contexts/fleet/devices/domain/repositories/device.repository";
import {
  BulkConfigureDevicesDto,
  ConfigureDeviceDto,
  RecordVerificationFailureDto,
} from "./dto/device-installation.dto";
import { TenantScoped } from "./tenant-scoped.decorator";
/** Reading the queue is an operations view; acting on it changes a device. */
const INSTALLER_READ_ROLES = [
  Role.ENTERPRISE_ADMIN,
  Role.FLEET_ADMIN,
  Role.OPERATIONS_MANAGER,
  Role.OWNER_OPERATOR,
  Role.DISPATCHER,
] as const;

const INSTALLER_WRITE_ROLES = [
  Role.ENTERPRISE_ADMIN,
  Role.FLEET_ADMIN,
  Role.OPERATIONS_MANAGER,
  Role.OWNER_OPERATOR,
] as const;


/**
 * The installer's work queue: configure a tracker, fit it, then wait for it to
 * report.
 *
 * Kept apart from the device inventory because the two answer different
 * questions. The inventory says what a tenant owns; this says what still needs
 * a person to do something to it.
 *
 * An installer is assumed to work for one tenant. If installers become
 * contractors working across several, that is a change to the role, not to
 * this workflow.
 */
@ApiTags("Device Installation")
@Controller("device-installation")
@TenantScoped()
@UseGuards(RolesGuard)
export class DeviceInstallationController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(GetInstallationQueueUseCase) private readonly queue: GetInstallationQueueUseCase,
    @Inject(GetVerificationMonitorUseCase) private readonly monitor: GetVerificationMonitorUseCase,
    @Inject(GetInstallerGuideUseCase) private readonly guides: GetInstallerGuideUseCase,
    @Inject(GetDeviceDiagnosticsUseCase) private readonly diagnostics: GetDeviceDiagnosticsUseCase,
    @Inject(ConfigureDeviceUseCase) private readonly configure: ConfigureDeviceUseCase,
    @Inject(BulkConfigureDevicesUseCase) private readonly bulkConfigure: BulkConfigureDevicesUseCase,
    @Inject(StartDeviceVerificationUseCase) private readonly startVerification: StartDeviceVerificationUseCase,
    @Inject(RecordVerificationFailureUseCase) private readonly recordFailure: RecordVerificationFailureUseCase,
    @Inject(DEVICE_REPOSITORY) private readonly devices: DeviceRepository,
  ) {
    super(auditLog, bus);
  }

  @Get()
  @Roles(...INSTALLER_READ_ROLES)
  @ApiOperation({
    summary: "Configuration queue",
    description:
      "Devices that still need configuring or verifying, with the next action for each and the three summary figures.",
  })
  @ApiOkResponse()
  async configurationQueue(@Req() req: FleetRequestContext) {
    const data = await this.queue.execute(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data };
  }

  @Get("verification")
  @Roles(...INSTALLER_READ_ROLES)
  @ApiOperation({
    summary: "Verification monitor",
    description:
      "Devices waiting for their first telemetry, and those whose attempt failed, with why.",
  })
  @ApiOkResponse()
  async verificationMonitor(@Req() req: FleetRequestContext) {
    const devices = await this.monitor.execute(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data: { devices } };
  }

  @Get("guides")
  @Roles(...INSTALLER_READ_ROLES)
  @ApiOperation({ summary: "Installer guides for every catalogued model" })
  @ApiOkResponse()
  async allGuides() {
    const guides = await this.guides.listAll();
    return { status: true, message: "success", data: { guides } };
  }

  @Get("guides/:manufacturer/:model")
  @Roles(...INSTALLER_READ_ROLES)
  @ApiOperation({ summary: "Installer guide for one model" })
  @ApiOkResponse()
  async guide(@Param("manufacturer") manufacturer: string, @Param("model") model: string) {
    const guide = await this.runFleetUseCase(() => this.guides.execute(manufacturer, model));
    return { status: true, message: "success", data: guide };
  }

  @Post("configure-batch")
  @Roles(...INSTALLER_WRITE_ROLES)
  @ApiOperation({
    summary: "Configure a batch of devices",
    description:
      "A shipment arrives as many units of one model. One device failing does not stop the rest.",
  })
  @ApiOkResponse()
  async configureBatch(@Body() body: BulkConfigureDevicesDto, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const result = await this.bulkConfigure.execute({
      tenantId,
      deviceIds: body.deviceIds,
      port: body.port,
    });

    await this.recordActivity(req, {
      entityType: "device",
      entityId: result.configured[0] ?? "batch",
      action: "configure_batch",
      summary: `Configured ${result.configured.length} devices`,
      metadata: { configured: result.configured.length, failed: result.failed.length },
    });

    return { status: true, message: "success", data: result };
  }

  @Get(":deviceId/diagnostics")
  @Roles(...INSTALLER_READ_ROLES)
  @ApiOperation({
    summary: "Troubleshooting for one device",
    description: "What was programmed into the device, next to what it has actually sent.",
  })
  @ApiOkResponse()
  async deviceDiagnostics(
    @Param("deviceId") deviceId: string,
    @Req() req: FleetRequestContext,
  ) {
    const data = await this.runFleetUseCase(() =>
      this.diagnostics.execute(deviceId, this.tenantIdFromRequest(req)),
    );
    return { status: true, message: "success", data };
  }

  @Post(":deviceId/configure")
  @Roles(...INSTALLER_WRITE_ROLES)
  @ApiOperation({
    summary: "Configure one device",
    description:
      "Records the protocol and port programmed into the device. Both come from the catalogue entry for its model, never from the caller.",
  })
  @ApiOkResponse()
  async configureDevice(
    @Param("deviceId") deviceId: string,
    @Body() body: ConfigureDeviceDto,
    @Req() req: FleetRequestContext,
  ) {
    const tenantId = this.tenantIdFromRequest(req);
    const device = await this.runFleetUseCase(() =>
      this.configure.execute({ tenantId, deviceId, port: body.port }),
    );

    await this.recordActivity(req, {
      entityType: "device",
      entityId: device.id,
      action: "configure",
      summary: `Configured ${device.manufacturer} ${device.model} for ${device.protocol}`,
      metadata: { protocol: device.protocol, port: device.port },
    });

    return { status: true, message: "success", data: toQueueRow(device) };
  }

  @Post(":deviceId/verify")
  @Roles(...INSTALLER_WRITE_ROLES)
  @ApiOperation({
    summary: "Start verification",
    description:
      "Opens the waiting window. Nothing is checked: the device reporting closes it, and the deadline passing without it fails the attempt.",
  })
  @ApiOkResponse()
  async verifyDevice(@Param("deviceId") deviceId: string, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const device = await this.runFleetUseCase(() =>
      this.startVerification.execute({ tenantId, deviceId }),
    );

    await this.recordActivity(req, {
      entityType: "device",
      entityId: device.id,
      action: "verify_signal",
      summary: `Waiting for first telemetry from ${device.imei}`,
      metadata: { deadline: device.verificationDeadline },
    });

    return { status: true, message: "success", data: toQueueRow(device) };
  }

  @Post(":deviceId/verification-failure")
  @Roles(...INSTALLER_WRITE_ROLES)
  @ApiOperation({
    summary: "Report a failed verification",
    description:
      "For a fault the installer can see that the timeout cannot: a rejected connection, or a payload nothing can read. The device stays configured and can be configured again.",
  })
  @ApiOkResponse()
  async reportFailure(
    @Param("deviceId") deviceId: string,
    @Body() body: RecordVerificationFailureDto,
    @Req() req: FleetRequestContext,
  ) {
    const tenantId = this.tenantIdFromRequest(req);
    const device = await this.devices.findById(deviceId, tenantId);
    if (!device) throw new NotFoundException(`Device ${deviceId} not found`);

    const failed = await this.recordFailure.execute({
      device,
      reason: body.reason,
      detail: body.detail,
      rawPayload: body.rawPayload,
      sourceAddress: body.sourceAddress,
    });

    await this.recordActivity(req, {
      entityType: "device",
      entityId: failed.id,
      action: "verification_failed",
      summary: `Verification failed for ${failed.imei}: ${body.reason}`,
      metadata: { reason: body.reason },
    });

    return { status: true, message: "success", data: toQueueRow(failed) };
  }
}

