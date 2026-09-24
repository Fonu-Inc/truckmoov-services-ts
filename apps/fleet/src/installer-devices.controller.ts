import {
  Controller,
  Get,
  Inject,
  Param,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Portals, SignedIn } from "@shared/access";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { AuditLogService } from "./audit-log.service";
import { BaseFleetController, type FleetRequestContext } from "./base.controller";
import { InstallerDevicesUseCases } from "./contexts/fleet/devices/application/use-cases/installer-devices.use-cases";
import {
  INSTALLER_DEVICE_SCOPE,
  type InstallerDeviceScopePort,
  type InstallerScopeEntry,
} from "./contexts/fleet/devices/domain/ports/installer-device-scope.port";
import { TenantScoped } from "./tenant-scoped.decorator";
import { SkipTenantCheck } from "./tenant.guard";

/**
 * The installer portal's device tabs. Installers work across tenants, so the
 * caller's own tenant says nothing here: auth names the devices on their jobs
 * and each is read in the tenant its job belongs to.
 */
@ApiTags("Installer portal")
@ApiBearerAuth()
@Portals("installer")
@SignedIn()
@Controller("installer/devices")
@TenantScoped()
@SkipTenantCheck()
export class InstallerDevicesController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(InstallerDevicesUseCases) private readonly installerDevices: InstallerDevicesUseCases,
    @Inject(INSTALLER_DEVICE_SCOPE) private readonly scope: InstallerDeviceScopePort,
  ) {
    super(auditLog, bus);
  }

  @Get("verification")
  @ApiOperation({
    summary: "Verification monitor",
    description:
      "Every device on the installer's open jobs and on jobs completed today, with the three counters. Also the Troubleshooting device picker.",
  })
  @ApiOkResponse()
  async verification(@Req() req: FleetRequestContext) {
    const data = await this.installerDevices.verification(await this.scopeOf(req));
    return { status: true, message: "success", data };
  }

  @Get(":deviceId/diagnostics")
  @ApiOperation({
    summary: "Troubleshooting for one device",
    description: "Status, last seen, errors and the endpoint the device should report to.",
  })
  @ApiOkResponse()
  async diagnostics(@Param("deviceId") deviceId: string, @Req() req: FleetRequestContext) {
    const scope = await this.scopeOf(req);
    const data = await this.runFleetUseCase(() => this.installerDevices.diagnose(scope, deviceId));
    return { status: true, message: "success", data };
  }

  private async scopeOf(req: FleetRequestContext): Promise<InstallerScopeEntry[]> {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException("missing or invalid authorization");
    const scope = await this.scope.forUser(userId);
    if (!scope) throw new ServiceUnavailableException("Installer jobs cannot be read right now");
    return scope;
  }
}
