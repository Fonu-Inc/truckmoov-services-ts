import { randomUUID } from "node:crypto";
import {
  Body,
  Res,
  Param,
  Inject,
  Get,
  Req,
  Patch,
  Delete,
  Controller,
  UseGuards,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOperation,
  ApiQuery,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import {
  RequireIdempotency,
  Roles,
  Role,
  IdempotencyGuard,
  RolesGuard,
} from "@shared/rbac";
import { AuditLogService } from "./audit-log.service";
import { BaseFleetController, FleetRequestContext } from "./base.controller";
import {
  ValidateDeviceAssignmentUseCase,
  DeleteDeviceUseCase,
  BulkImportDevicesUseCase,
  UpdateDeviceUseCase,
  CreateDeviceUseCase,
  UnassignDeviceFromVehicleUseCase,
  AssignDeviceToVehicleUseCase,
  ListDevicesUseCase,
  GetDeviceUseCase,
  SetDeviceLifecycleStatusUseCase,
} from "./contexts/fleet/devices";
import {
  DeviceAssignmentValidationResponse,
  DeviceListResponse,
  BulkDeviceImportResponse,
  DeviceResponse,
} from "./dto/fleet.schema";
import {
  DeviceListQueryDto,
  SetDeviceLifecycleStatusDto,
  AssignDeviceToVehicleDto,
  SetDeviceFirmwareDto,
  UpdateDeviceDto,
  DeviceAssignmentValidationQueryDto,
  CreateDeviceDto,
  BulkImportDevicesDto,
} from "./dto/vehicle.dto";
import { TenantScoped } from "./tenant-scoped.decorator";

@ApiTags("Devices")
@Controller("devices")
@TenantScoped()
@UseGuards(RolesGuard)
export class DevicesController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(ListDevicesUseCase) private readonly listDevicesUseCase: ListDevicesUseCase,
    @Inject(GetDeviceUseCase) private readonly getDeviceUseCase: GetDeviceUseCase,
    @Inject(CreateDeviceUseCase) private readonly createDeviceUseCase: CreateDeviceUseCase,
    @Inject(UpdateDeviceUseCase) private readonly updateDeviceUseCase: UpdateDeviceUseCase,
    @Inject(DeleteDeviceUseCase) private readonly deleteDeviceUseCase: DeleteDeviceUseCase,
    @Inject(BulkImportDevicesUseCase) private readonly bulkImportDevicesUseCase: BulkImportDevicesUseCase,
    @Inject(AssignDeviceToVehicleUseCase) private readonly assignDeviceToVehicleUseCase: AssignDeviceToVehicleUseCase,
    @Inject(UnassignDeviceFromVehicleUseCase) private readonly unassignDeviceFromVehicleUseCase: UnassignDeviceFromVehicleUseCase,
    @Inject(SetDeviceLifecycleStatusUseCase) private readonly setDeviceLifecycleStatusUseCase: SetDeviceLifecycleStatusUseCase,
    @Inject(ValidateDeviceAssignmentUseCase) private readonly validateDeviceAssignmentUseCase: ValidateDeviceAssignmentUseCase,
  ) {
    super(auditLog, bus);
  }

  @Get()
  @Roles(
    Role.ENTERPRISE_ADMIN,
    Role.PLATFORM_ADMIN,
    Role.FLEET_ADMIN,
    Role.OPERATIONS_MANAGER,
    Role.DISPATCHER,
    Role.FINANCE_VIEWER,
  )
  @ApiOperation({
    summary: "List devices",
    description: "Lists standalone GPS/IoT devices for the fleet admin Devices inventory page.",
  })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiQuery({ name: "manufacturer", required: false, type: String })
  @ApiQuery({ name: "status", required: false, enum: ["registered", "configured", "assigned", "active", "faulty", "decommissioned"] })
  @ApiQuery({ name: "lifecycleStatus", required: false, enum: ["registered", "config_pending", "configured", "verified_online", "assignable", "assigned", "faulty", "decommissioned"] })
  @ApiQuery({ name: "assigned", required: false, enum: ["true", "false"] })
  @ApiQuery({ name: "lastSeenBucket", required: false, enum: ["5min", "1hr", "24hr", "7day", "never"] })
  @ApiOkResponse({ type: DeviceListResponse })
  async listDevices(@Query() query: DeviceListQueryDto, @Req() req: FleetRequestContext): Promise<DeviceListResponse> {
    return this.listDevicesUseCase.execute({
      query: query.query,
      manufacturer: query.manufacturer,
      status: query.status,
      lifecycleStatus: query.lifecycleStatus,
      assigned: this.parseOptionalBoolean(query.assigned, "assigned"),
      lastSeenBucket: query.lastSeenBucket,
      tenantId: this.tenantIdFromRequest(req),
    }) as unknown as Promise<DeviceListResponse>;
  }

  @Get("export")
  @Roles(
    Role.ENTERPRISE_ADMIN,
    Role.PLATFORM_ADMIN,
    Role.FLEET_ADMIN,
    Role.OPERATIONS_MANAGER,
    Role.DISPATCHER,
    Role.FINANCE_VIEWER,
  )
  @ApiOperation({ summary: "Export devices as CSV" })
  @ApiOkResponse({ description: "CSV file", content: { "text/csv": {} } })
  async exportDevices(@Query() query: DeviceListQueryDto, @Req() req: FleetRequestContext, @Res({ passthrough: false }) res: any) {
    const devices = (await this.listDevicesUseCase.execute({
      query: query.query,
      manufacturer: query.manufacturer,
      status: query.status,
      lifecycleStatus: query.lifecycleStatus,
      assigned: this.parseOptionalBoolean(query.assigned, "assigned"),
      lastSeenBucket: query.lastSeenBucket,
      tenantId: this.tenantIdFromRequest(req),
    })) as unknown as Array<Record<string, unknown>>;
    const headers = ["id", "imei", "manufacturer", "model", "firmwareVersion", "lifecycleStatus", "status", "vehicleId", "lastSeen"];
    const rows = [headers.join(","), ...devices.map((d) => headers.map((h) => JSON.stringify(d[h] ?? "")).join(","))];
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=devices.csv");
    res.send(rows.join("\n"));
  }

  @Get("import-template")
  @Roles(Role.ENTERPRISE_ADMIN, Role.PLATFORM_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Download the CSV template for bulk device import" })
  @ApiOkResponse({ description: "CSV template", content: { "text/csv": {} } })
  async downloadDeviceImportTemplate(@Res({ passthrough: false }) res: any) {
    const headers = ["imei", "manufacturer", "model", "firmwareVersion", "lifecycleStatus"];
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=devices-import-template.csv");
    res.send(headers.join(","));
  }

  @Post()
  @Roles(Role.ENTERPRISE_ADMIN, Role.PLATFORM_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Create device",
    description: "Registers a standalone GPS/IoT device before it is assigned to a vehicle.",
  })
  @ApiCreatedResponse({ type: DeviceResponse })
  async createDevice(@Body() payload: CreateDeviceDto, @Req() req: FleetRequestContext): Promise<DeviceResponse> {
    const result = await this.createDeviceUseCase.execute({
      ...payload,
      tenantId: this.tenantIdFromRequest(req),
    });
    await this.recordActivity(req, {
      entityType: "device",
      entityId: result.id,
      action: "device.created",
      summary: "Device registered",
      metadata: {
        imei: result.imei,
        manufacturer: result.manufacturer,
        model: result.model,
        lifecycleStatus: result.lifecycleStatus,
      },
    });
    return result as unknown as DeviceResponse;
  }

  @Post("import")
  @Roles(Role.ENTERPRISE_ADMIN, Role.PLATFORM_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Bulk import devices",
    description: "Bulk registers or updates GPS/IoT devices for the fleet Devices inventory.",
  })
  @ApiCreatedResponse({ type: BulkDeviceImportResponse })
  async bulkImportDevices(@Body() payload: BulkImportDevicesDto, @Req() req: FleetRequestContext): Promise<BulkDeviceImportResponse> {
    const result = await this.bulkImportDevicesUseCase.execute({
      ...payload,
      tenantId: this.tenantIdFromRequest(req),
    });
    await this.recordActivity(req, {
      entityType: "device",
      entityId: randomUUID(),
      action: "device.bulk_imported",
      summary: "Device bulk import completed",
      metadata: {
        created: result.created,
        updated: result.updated,
        total: result.total,
      },
    });
    return result as unknown as BulkDeviceImportResponse;
  }

  @Get(":id")
  @Roles(
    Role.ENTERPRISE_ADMIN,
    Role.PLATFORM_ADMIN,
    Role.FLEET_ADMIN,
    Role.OPERATIONS_MANAGER,
    Role.DISPATCHER,
    Role.FINANCE_VIEWER,
  )
  @ApiOperation({ summary: "Get device by ID" })
  @ApiOkResponse({ type: DeviceResponse })
  async getDevice(@Param("id") id: string, @Req() req: FleetRequestContext): Promise<DeviceResponse> {
    return this.runFleetUseCase(() =>
      this.getDeviceUseCase.execute(id, this.tenantIdFromRequest(req)),
    ) as unknown as Promise<DeviceResponse>;
  }

  @Patch(":id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.PLATFORM_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Update device" })
  @ApiOkResponse({ type: DeviceResponse })
  async updateDevice(
    @Param("id") id: string,
    @Body() payload: UpdateDeviceDto,
    @Req() req: FleetRequestContext,
  ): Promise<DeviceResponse> {
    const result = await this.runFleetUseCase(() =>
      this.updateDeviceUseCase.execute({ id, ...payload, tenantId: this.tenantIdFromRequest(req) }),
    ) as unknown as DeviceResponse;
    await this.recordActivity(req, {
      entityType: "device",
      entityId: id,
      action: "device.updated",
      summary: "Device updated",
      metadata: payload as Record<string, unknown>,
    });
    return result;
  }

  @Patch(":id/lifecycle")
  @Roles(Role.ENTERPRISE_ADMIN, Role.PLATFORM_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Set device lifecycle status",
    description: "Advances or changes a device through the installation lifecycle used by the Devices page.",
  })
  @ApiOkResponse({ type: DeviceResponse })
  async setDeviceLifecycleStatus(
    @Param("id") id: string,
    @Body() payload: SetDeviceLifecycleStatusDto,
    @Req() req: FleetRequestContext,
  ): Promise<DeviceResponse> {
    const result = await this.runFleetUseCase(() =>
      this.setDeviceLifecycleStatusUseCase.execute({
        id,
        lifecycleStatus: payload.lifecycleStatus,
        tenantId: this.tenantIdFromRequest(req),
      }),
    ) as unknown as DeviceResponse;
    await this.recordActivity(req, {
      entityType: "device",
      entityId: id,
      action: "device.lifecycle.updated",
      summary: "Device lifecycle status updated",
      metadata: { lifecycleStatus: payload.lifecycleStatus },
    });
    return result;
  }

  @Patch(":id/firmware")
  @Roles(Role.ENTERPRISE_ADMIN, Role.PLATFORM_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Update device firmware version" })
  @ApiOkResponse({ type: DeviceResponse })
  async setDeviceFirmware(
    @Param("id") id: string,
    @Body() payload: SetDeviceFirmwareDto,
    @Req() req: FleetRequestContext,
  ): Promise<DeviceResponse> {
    const result = (await this.runFleetUseCase(() =>
      this.updateDeviceUseCase.execute({
        id,
        firmwareVersion: payload.firmwareVersion,
        tenantId: this.tenantIdFromRequest(req),
      }),
    )) as unknown as DeviceResponse;
    await this.recordActivity(req, {
      entityType: "device",
      entityId: id,
      action: "device.firmware.updated",
      summary: "Device firmware updated",
      metadata: { firmwareVersion: payload.firmwareVersion },
    });
    return result;
  }

  @Get(":id/assignment/validate")
  @Roles(Role.ENTERPRISE_ADMIN, Role.PLATFORM_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER, Role.DISPATCHER)
  @ApiOperation({
    summary: "Validate device assignment",
    description: "Checks whether a device can be assigned to a specific vehicle before the UI submits the actual assignment.",
  })
  @ApiOkResponse({ type: DeviceAssignmentValidationResponse })
  async validateDeviceAssignment(
    @Param("id") id: string,
    @Query() query: DeviceAssignmentValidationQueryDto,
    @Req() req: FleetRequestContext,
  ): Promise<DeviceAssignmentValidationResponse> {
    return this.validateDeviceAssignmentUseCase.execute(
      id,
      query.vehicleId,
      this.tenantIdFromRequest(req),
    ) as unknown as DeviceAssignmentValidationResponse;
  }

  @Patch(":id/assignment")
  @Roles(Role.ENTERPRISE_ADMIN, Role.PLATFORM_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Assign device to vehicle",
    description: "Assigns a standalone device inventory record to a fleet vehicle.",
  })
  @ApiOkResponse({ type: DeviceResponse })
  async assignDeviceToVehicle(
    @Param("id") id: string,
    @Body() payload: AssignDeviceToVehicleDto,
    @Req() req: FleetRequestContext,
  ): Promise<DeviceResponse> {
    const result = await this.runFleetUseCase(() =>
      this.assignDeviceToVehicleUseCase.execute({
        deviceId: id,
        vehicleId: payload.vehicleId,
        tenantId: this.tenantIdFromRequest(req),
      }),
    ) as unknown as DeviceResponse;
    await this.recordActivity(req, {
      entityType: "device",
      entityId: id,
      action: "device.assigned",
      summary: "Device assigned to vehicle",
      metadata: { vehicleId: payload.vehicleId },
    });
    return result;
  }

  @Delete(":id/assignment")
  @Roles(Role.ENTERPRISE_ADMIN, Role.PLATFORM_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Unassign device from vehicle" })
  @ApiOkResponse({ type: DeviceResponse })
  async unassignDeviceFromVehicle(@Param("id") id: string, @Req() req: FleetRequestContext): Promise<DeviceResponse> {
    const result = await this.runFleetUseCase(() =>
      this.unassignDeviceFromVehicleUseCase.execute(id, this.tenantIdFromRequest(req)),
    ) as unknown as DeviceResponse;
    await this.recordActivity(req, {
      entityType: "device",
      entityId: id,
      action: "device.unassigned",
      summary: "Device unassigned from vehicle",
    });
    return result;
  }

  @Delete(":id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.PLATFORM_ADMIN, Role.FLEET_ADMIN, Role.OPERATIONS_MANAGER)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Delete device" })
  @ApiOkResponse({ type: DeviceResponse })
  async deleteDevice(@Param("id") id: string, @Req() req: FleetRequestContext): Promise<DeviceResponse> {
    const result = await this.runFleetUseCase(() =>
      this.deleteDeviceUseCase.execute(id, this.tenantIdFromRequest(req)),
    ) as unknown as DeviceResponse;
    await this.recordActivity(req, {
      entityType: "device",
      entityId: id,
      action: "device.deleted",
      summary: "Device deleted",
    });
    return result;
  }
}
