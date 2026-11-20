import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  Res,
  Param,
  Inject,
  Get,
  Req,
  Patch,
  Delete,
  Controller,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Post,
  Query,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiQuery,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { MAX_DOCUMENT_UPLOAD_BYTES, uploadLimits } from "@shared/http";
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
  DeviceCatalogLookupUseCase,
  DeviceFilterOptionsUseCase,
  DeviceInventorySummaryUseCase,
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
  SuspendDeviceUseCase,
  ReinstateDeviceUseCase,
  DEVICE_STATUS_FILTERS,
} from "./contexts/fleet/devices";
import {
  buildDeviceCsvExport,
  buildDeviceCsvTemplate,
  DEVICE_CSV_COLUMNS,
  parseDeviceCsv,
  type DeviceCsvRow,
} from "./contexts/fleet/devices/domain/device-csv";
import {
  DeviceAssignmentValidationResponse,
  DeviceFiltersResponse,
  DeviceListResponse,
  DeviceSummaryResponse,
  BulkDeviceImportResponse,
  DeviceResponse,
} from "./dto/fleet.schema";
import {
  DeviceListQueryDto,
  SetDeviceLifecycleStatusDto,
  SuspendDeviceDto,
  AssignDeviceToVehicleDto,
  SetDeviceFirmwareDto,
  UpdateDeviceDto,
  DeviceAssignmentValidationQueryDto,
  CreateDeviceDto,
} from "./dto/vehicle.dto";
import { TenantScoped } from "./tenant-scoped.decorator";
import { Portals, OnResource } from "@shared/access";
import { paginate } from "@shared/pagination";

@ApiTags("Devices")
@Portals("tenant")
@OnResource("tenant.devices")
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
    @Inject(DeviceInventorySummaryUseCase) private readonly deviceInventorySummaryUseCase: DeviceInventorySummaryUseCase,
    @Inject(DeviceFilterOptionsUseCase) private readonly deviceFilterOptionsUseCase: DeviceFilterOptionsUseCase,
    @Inject(DeviceCatalogLookupUseCase) private readonly deviceCatalogLookupUseCase: DeviceCatalogLookupUseCase,
    @Inject(SuspendDeviceUseCase) private readonly suspendDeviceUseCase: SuspendDeviceUseCase,
    @Inject(ReinstateDeviceUseCase) private readonly reinstateDeviceUseCase: ReinstateDeviceUseCase,
  ) {
    super(auditLog, bus);
  }

  @Get()
  @Roles(
    Role.ENTERPRISE_ADMIN,
    Role.OWNER_OPERATOR,
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
  @ApiQuery({
    name: "status",
    required: false,
    enum: DEVICE_STATUS_FILTERS,
    description: "online / offline read the heartbeat (TRACKING_STATUS_TIMEOUT_SECONDS); suspended is the lifecycle state.",
  })
  @ApiQuery({ name: "lifecycleStatus", required: false, enum: ["registered", "config_pending", "configured", "verified_online", "assignable", "assigned", "faulty", "decommissioned"] })
  @ApiQuery({ name: "assigned", required: false, enum: ["true", "false"] })
  @ApiQuery({ name: "lastSeenBucket", required: false, enum: ["5min", "1hr", "24hr", "7day", "never"] })
  @ApiOkResponse({ type: DeviceListResponse })
  async listDevices(@Query() query: DeviceListQueryDto, @Req() req: FleetRequestContext): Promise<DeviceListResponse> {
    const devices = await this.listDevicesUseCase.execute(this.listFilters(query, req));
    const { items, meta } = paginate(devices, query);
    return { status: true, message: "success", data: items, meta } as unknown as DeviceListResponse;
  }

  @Get("summary")
  @Roles(
    Role.ENTERPRISE_ADMIN,
    Role.OWNER_OPERATOR,
    Role.OPERATIONS_MANAGER,
    Role.DISPATCHER,
    Role.FINANCE_VIEWER,
  )
  @ApiOperation({
    summary: "Device status cards",
    description:
      "Counts behind the My Devices cards, plus the plan allowance bar. online, offline, suspended and decommissioned partition total.",
  })
  @ApiOkResponse({ type: DeviceSummaryResponse })
  async deviceSummary(@Req() req: FleetRequestContext) {
    const data = await this.deviceInventorySummaryUseCase.execute(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data };
  }

  @Get("filters")
  @Roles(
    Role.ENTERPRISE_ADMIN,
    Role.OWNER_OPERATOR,
    Role.OPERATIONS_MANAGER,
    Role.DISPATCHER,
    Role.FINANCE_VIEWER,
  )
  @ApiOperation({
    summary: "Device filter options",
    description: "Statuses, manufacturers and last-seen buckets for the filter panel.",
  })
  @ApiOkResponse({ type: DeviceFiltersResponse })
  async deviceFilters(@Req() req: FleetRequestContext) {
    const data = await this.deviceFilterOptionsUseCase.execute(this.tenantIdFromRequest(req));
    return { status: true, message: "success", data };
  }

  @Get("catalog/manufacturers")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({
    summary: "Supported manufacturers",
    description:
      "Manufacturers with at least one supported model in the platform device catalog, for the Add Device and Request Device modals. " +
      "No built-in defaults are added: a manufacturer without a catalogued model has no protocol to configure a device with.",
  })
  @ApiOkResponse({ description: "Manufacturer names" })
  async listCatalogManufacturers() {
    const data = await this.deviceCatalogLookupUseCase.manufacturers();
    return { status: true, message: "success", data };
  }

  @Get("catalog/models")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({
    summary: "Supported models",
    description: "Models for one manufacturer, or the whole catalog when no manufacturer is given.",
  })
  @ApiQuery({ name: "manufacturer", required: false, type: String })
  @ApiOkResponse({ description: "Catalog models" })
  async listCatalogModels(@Query("manufacturer") manufacturer?: string) {
    const data = await this.deviceCatalogLookupUseCase.models(manufacturer);
    return { status: true, message: "success", data };
  }

  @Get("export")
  @Roles(
    Role.ENTERPRISE_ADMIN,
    Role.OWNER_OPERATOR,
    Role.OPERATIONS_MANAGER,
    Role.DISPATCHER,
    Role.FINANCE_VIEWER,
  )
  @ApiOperation({
    summary: "Export devices as CSV",
    description: "Same columns as the bulk import template, so an export can be edited and imported back.",
  })
  @ApiOkResponse({ description: "CSV file", content: { "text/csv": {} } })
  async exportDevices(
    @Query() query: DeviceListQueryDto,
    @Req() req: FleetRequestContext,
    @Res({ passthrough: false }) res: any,
  ) {
    const devices = (await this.listDevicesUseCase.execute(
      this.listFilters(query, req),
    )) as unknown as Array<Record<string, unknown>>;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=devices.csv");
    res.send(
      buildDeviceCsvExport(
        devices.map((device) => ({
          imei: String(device["imei"] ?? ""),
          name: (device["name"] as string | null) ?? null,
          manufacturer: String(device["manufacturer"] ?? ""),
          model: String(device["model"] ?? ""),
          firmwareVersion: (device["firmwareVersion"] as string | null) ?? null,
          lifecycleStatus: (device["lifecycleStatus"] as DeviceCsvRow["lifecycleStatus"]) ?? null,
        })),
      ),
    );
  }

  @Get("import/template")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Download the CSV template for bulk device import" })
  @ApiOkResponse({ description: "CSV template", content: { "text/csv": {} } })
  async downloadDeviceImportTemplate(@Res({ passthrough: false }) res: any) {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=devices-import-template.csv");
    res.send(buildDeviceCsvTemplate());
  }

  @Get("import/columns")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Describe the bulk import columns" })
  @ApiOkResponse({ description: "Column definitions" })
  async describeDeviceImportColumns() {
    return { status: true, message: "success", data: { columns: DEVICE_CSV_COLUMNS } };
  }

  @Post()
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
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
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Bulk import devices",
    description:
      "Registers or updates devices from a CSV. Refused whole when the file would take the tenant past its device allowance.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" } } },
  })
  @ApiCreatedResponse({ type: BulkDeviceImportResponse })
  @ApiBadRequestResponse({ description: "Missing file, or the CSV is not readable" })
  @UseInterceptors(FileInterceptor("file", uploadLimits(MAX_DOCUMENT_UPLOAD_BYTES)))
  async bulkImportDevices(
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    @Req() req: FleetRequestContext,
  ): Promise<BulkDeviceImportResponse> {
    if (!file?.buffer?.length) {
      throw new BadRequestException("Missing CSV file");
    }

    let parsed: ReturnType<typeof parseDeviceCsv>;
    try {
      parsed = parseDeviceCsv(file.buffer.toString("utf8"));
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "The CSV could not be read");
    }

    if (parsed.rows.length === 0) {
      throw new BadRequestException(
        parsed.errors.length > 0
          ? `No importable rows. First problem on line ${parsed.errors[0].line}: ${parsed.errors[0].message}`
          : "The CSV contained no device rows",
      );
    }

    const result = await this.runFleetUseCase(() =>
      this.bulkImportDevicesUseCase.execute({
        rows: parsed.rows,
        skipped: parsed.errors,
        tenantId: this.tenantIdFromRequest(req),
      }),
    ) as unknown as BulkDeviceImportResponse & { created: number; updated: number; total: number };

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
    Role.OWNER_OPERATOR,
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
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
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
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Set device lifecycle status",
    description:
      "Allowed moves: registered → config_pending or configured; config_pending → configured or faulty; configured → verified_online or faulty; verified_online → assignable or faulty; assignable → faulty (assigned only through PATCH /assignment); assigned → assignable or faulty; faulty → config_pending or configured, so a repaired device is reconfigured and verified again. Decommissioning is permanent and platform-only. Suspension has its own route. Any other move is a 400.",
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

  @Post(":id/suspend")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({
    summary: "Suspend a device",
    description:
      "Takes the device out of service and releases its vehicle assignment. Reinstating returns it to where it was (an assigned device comes back assignable). A decommissioned or already suspended device is a 400.",
  })
  @ApiOkResponse({ type: DeviceResponse })
  async suspendDevice(@Param("id") id: string, @Body() payload: SuspendDeviceDto, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const data = await this.runFleetUseCase(() => this.suspendDeviceUseCase.execute(id, payload?.reason ?? null, tenantId));
    await this.recordActivity(req, {
      entityType: "device",
      entityId: id,
      action: "device.suspended",
      summary: "Device suspended",
      metadata: { reason: payload?.reason ?? null },
    });
    return { status: true, message: "Device suspended", data } as unknown as DeviceResponse;
  }

  @Post(":id/reinstate")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({
    summary: "Reinstate a device the tenant suspended",
    description:
      "Only a suspension the tenant made can be lifted here. A device the platform suspended answers 400 and stays suspended until the platform reinstates it.",
  })
  @ApiOkResponse({ type: DeviceResponse })
  async reinstateDevice(@Param("id") id: string, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const data = await this.runFleetUseCase(() => this.reinstateDeviceUseCase.execute(id, tenantId));
    await this.recordActivity(req, {
      entityType: "device",
      entityId: id,
      action: "device.reinstated",
      summary: "Device reinstated",
    });
    return { status: true, message: "Device reinstated", data } as unknown as DeviceResponse;
  }

  @Patch(":id/firmware")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
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
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER, Role.DISPATCHER)
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
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
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
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
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
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
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

  /** One filter shape behind the list and the export, so they cannot diverge. */
  private listFilters(query: DeviceListQueryDto, req: FleetRequestContext) {
    return {
      query: query.query,
      manufacturer: query.manufacturer,
      statusFilter: query.status,
      lifecycleStatus: query.lifecycleStatus,
      assigned: this.parseOptionalBoolean(query.assigned, "assigned"),
      lastSeenBucket: query.lastSeenBucket,
      tenantId: this.tenantIdFromRequest(req),
    };
  }
}
