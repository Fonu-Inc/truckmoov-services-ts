import { randomUUID } from "node:crypto";
import {
  Body,
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
  ApiBadRequestResponse,
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
  GetDriverUseCase,
  BulkImportDriversUseCase,
  DeleteDriverUseCase,
  CreateDriverUseCase,
  ListDriversUseCase,
  SetDriverStatusUseCase,
  UpdateDriverContactChannelsUseCase,
  UpdateDriverUseCase,
} from "./contexts/fleet/drivers";
import { normalizeDriverStatus, DRIVER_STATUS_INPUTS } from "./contexts/fleet/drivers/domain/entities/driver.entity";
import {
  SetDriverStatusDto,
  UpdateDriverContactChannelsDto,
  CreateDriverDto,
  DriverListQueryDto,
  UpdateDriverDto,
  BulkImportDriversDto,
} from "./dto/driver.dto";
import { BulkDriverImportResponse, DriverListResponse, DriverResponse } from "./dto/fleet.schema";
import { TenantScoped } from "./tenant-scoped.decorator";

@ApiTags("Drivers")
@Controller("drivers")
@TenantScoped()
@UseGuards(RolesGuard)
export class DriversController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(ListDriversUseCase) private readonly listDriversUseCase: ListDriversUseCase,
    @Inject(CreateDriverUseCase) private readonly createDriverUseCase: CreateDriverUseCase,
    @Inject(GetDriverUseCase) private readonly getDriverUseCase: GetDriverUseCase,
    @Inject(UpdateDriverUseCase) private readonly updateDriverUseCase: UpdateDriverUseCase,
    @Inject(DeleteDriverUseCase) private readonly deleteDriverUseCase: DeleteDriverUseCase,
    @Inject(SetDriverStatusUseCase) private readonly setDriverStatusUseCase: SetDriverStatusUseCase,
    @Inject(UpdateDriverContactChannelsUseCase) private readonly updateDriverContactChannelsUseCase: UpdateDriverContactChannelsUseCase,
    @Inject(BulkImportDriversUseCase) private readonly bulkImportDriversUseCase: BulkImportDriversUseCase,
  ) {
    super(auditLog, bus);
  }

  @Get()
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER)
  @ApiOperation({
    summary: "List drivers",
    description: "Epic C (US-C02, US-C04, US-C06): list/search/filter drivers.",
  })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiQuery({ name: "status", required: false, enum: DRIVER_STATUS_INPUTS })
  @ApiQuery({ name: "assigned", required: false, enum: ["true", "false"] })
  @ApiOkResponse({ type: DriverListResponse })
  @ApiBadRequestResponse({ description: "Invalid query parameter values" })
  async listDrivers(@Query() query: DriverListQueryDto, @Req() req: FleetRequestContext): Promise<DriverListResponse> {
    return this.listDriversUseCase.execute({
      query: query.query,
      status: normalizeDriverStatus(query.status),
      assigned: this.parseOptionalBoolean(query.assigned, "assigned"),
      tenantId: this.tenantIdFromRequest(req),
    }) as unknown as Promise<DriverListResponse>;
  }

  /** Register a new driver */

  @Post()
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Create driver",
    description: "Epic C (US-C02): create a new driver record.",
  })
  @ApiCreatedResponse({ type: DriverResponse })
  async createDriver(@Body() payload: CreateDriverDto, @Req() req: FleetRequestContext): Promise<DriverResponse> {
    const result = await this.createDriverUseCase.execute({
      ...payload,
      tenantId: this.tenantIdFromRequest(req),
    });
    await this.recordActivity(req, {
      entityType: "driver",
      entityId: result.id,
      action: "driver.created",
      summary: "Driver created",
      metadata: {
        name: result.name,
        licenseNumber: result.licenseNumber,
        status: result.status,
      },
    });
    return result as unknown as DriverResponse;
  }

  /** Bulk onboarding for driver records */

  @Post("import")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Bulk import drivers",
    description: "Epic C (US-C05): bulk upsert drivers by license number.",
  })
  @ApiCreatedResponse({ type: BulkDriverImportResponse })
  async bulkImportDrivers(@Body() payload: BulkImportDriversDto, @Req() req: FleetRequestContext): Promise<BulkDriverImportResponse> {
    const result = await this.bulkImportDriversUseCase.execute({
      ...payload,
      tenantId: this.tenantIdFromRequest(req),
    });
    await this.recordActivity(req, {
      entityType: "driver",
      entityId: randomUUID(),
      action: "driver.bulk_imported",
      summary: "Driver bulk import completed",
      metadata: {
        created: result.created,
        updated: result.updated,
        total: result.total,
      },
    });
    return result as unknown as BulkDriverImportResponse;
  }

  /** Retrieve a driver by ID */

  @Get(":id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER)
  @ApiOperation({ summary: "Get driver by ID" })
  @ApiOkResponse({ type: DriverResponse })
  async getDriver(@Param("id") id: string, @Req() req: FleetRequestContext): Promise<DriverResponse> {
    return this.runFleetUseCase(() =>
      this.getDriverUseCase.execute(id, this.tenantIdFromRequest(req)),
    ) as unknown as Promise<DriverResponse>;
  }

  /** Partially update a driver's details */

  @Patch(":id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Update driver" })
  @ApiOkResponse({ type: DriverResponse })
  async updateDriver(
    @Param("id") id: string,
    @Body() payload: UpdateDriverDto,
    @Req() req: FleetRequestContext,
  ): Promise<DriverResponse> {
    const result = await this.runFleetUseCase(() =>
      this.updateDriverUseCase.execute({ id, ...payload, tenantId: this.tenantIdFromRequest(req) }),
    ) as unknown as DriverResponse;
    await this.recordActivity(req, {
      entityType: "driver",
      entityId: id,
      action: "driver.updated",
      summary: "Driver updated",
      metadata: payload as Record<string, unknown>,
    });
    return result;
  }

  /** Activate/deactivate driver availability for dispatch */

  @Patch(":id/status")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Set driver status",
    description: "Epic C (US-C04): activate/deactivate driver availability.",
  })
  @ApiOkResponse({ type: DriverResponse })
  async setDriverStatus(
    @Param("id") id: string,
    @Body() payload: SetDriverStatusDto,
    @Req() req: FleetRequestContext,
  ): Promise<DriverResponse> {
    const result = await this.runFleetUseCase(() =>
      this.setDriverStatusUseCase.execute({
        id,
        tenantId: this.tenantIdFromRequest(req),
        status: normalizeDriverStatus(payload.status) ?? "active",
      }),
    ) as unknown as DriverResponse;
    await this.recordActivity(req, {
      entityType: "driver",
      entityId: id,
      action: "driver.status.updated",
      summary: "Driver status updated",
      metadata: {
        status: normalizeDriverStatus(payload.status) ?? "active",
      },
    });
    return result;
  }

  /** Manage WhatsApp/SMS/voice contact channels used for dispatch communication */

  @Patch(":id/contact-channels")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.DISPATCHER)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Update driver contact channels",
    description: "Epic C (US-C07): manage driver WhatsApp/SMS/voice channels.",
  })
  @ApiOkResponse({ type: DriverResponse })
  async updateDriverContactChannels(
    @Param("id") id: string,
    @Body() payload: UpdateDriverContactChannelsDto,
    @Req() req: FleetRequestContext,
  ): Promise<DriverResponse> {
    const result = await this.runFleetUseCase(() =>
      this.updateDriverContactChannelsUseCase.execute({
        id,
        tenantId: this.tenantIdFromRequest(req),
        channels: payload,
      }),
    ) as unknown as DriverResponse;
    await this.recordActivity(req, {
      entityType: "driver",
      entityId: id,
      action: "driver.contact_channels.updated",
      summary: "Driver contact channels updated",
      metadata: payload as Record<string, unknown>,
    });
    return result;
  }

  /** Remove a driver record */

  @Delete(":id")
  @Roles(Role.ENTERPRISE_ADMIN)
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Delete driver" })
  @ApiOkResponse({ type: DriverResponse })
  async deleteDriver(@Param("id") id: string, @Req() req: FleetRequestContext): Promise<DriverResponse> {
    const result = await this.runFleetUseCase(() =>
      this.deleteDriverUseCase.execute(id, this.tenantIdFromRequest(req)),
    ) as unknown as DriverResponse;
    await this.recordActivity(req, {
      entityType: "driver",
      entityId: id,
      action: "driver.deleted",
      summary: "Driver deleted",
    });
    return result;
  }

  /** Combined dispatcher search over vehicles and drivers */
}
