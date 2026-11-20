import {
  Body,
  Param,
  Inject,
  Get,
  Req,
  Patch,
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
import { Roles, Role, RolesGuard } from "@shared/rbac";
import { AuditLogService } from "./audit-log.service";
import { BaseFleetController, FleetRequestContext } from "./base.controller";
import {
  GetDeviceSetupRequestUseCase,
  ListDeviceSetupRequestsUseCase,
  CreateDeviceSetupRequestUseCase,
  UpdateDeviceSetupRequestStatusUseCase,
} from "./contexts/fleet/device-setup-requests";
import {
  DEVICE_SETUP_REQUEST_STATUSES,
  TRACKER_TYPE_OPTIONS,
} from "./contexts/fleet/device-setup-requests/domain/entities/device-setup-request.entity";
import { UpdateDeviceSetupRequestStatusDto, CreateDeviceSetupRequestDto, DeviceSetupRequestListQueryDto } from "./dto/device-setup-request.dto";
import { DeviceSetupRequestListResponse, DeviceSetupRequestResponse } from "./dto/fleet.schema";
import { TenantScoped } from "./tenant-scoped.decorator";
import { Portals, OnResource, Requires } from "@shared/access";
import { paginate } from "@shared/pagination";

@ApiTags("Device Setup Requests")
@Portals("tenant")
@OnResource("tenant.devices")
@Controller("device-setup-requests")
@TenantScoped()
@UseGuards(RolesGuard)
export class DeviceSetupRequestsController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(CreateDeviceSetupRequestUseCase) private readonly createDeviceSetupRequestUseCase: CreateDeviceSetupRequestUseCase,
    @Inject(ListDeviceSetupRequestsUseCase) private readonly listDeviceSetupRequestsUseCase: ListDeviceSetupRequestsUseCase,
    @Inject(GetDeviceSetupRequestUseCase) private readonly getDeviceSetupRequestUseCase: GetDeviceSetupRequestUseCase,
    @Inject(UpdateDeviceSetupRequestStatusUseCase) private readonly updateDeviceSetupRequestStatusUseCase: UpdateDeviceSetupRequestStatusUseCase,
  ) {
    super(auditLog, bus);
  }

  // Asking Fonu for devices changes none the tenant already has.
  @Requires("tenant.devices.read")
  @Post()
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER, Role.DISPATCHER)
  @ApiOperation({
    summary: "Request device setup",
    description: "Submits a device request (quantity, optional SIM carrier/data bundle, vehicle, location, use case). Manufacturer and tracker type are optional; the platform picks the hardware. Returns a DVR-NNNNNN reference and starts under_review.",
  })
  @ApiCreatedResponse({ type: DeviceSetupRequestResponse })
  async createDeviceSetupRequest(
    @Body() payload: CreateDeviceSetupRequestDto,
    @Req() req: FleetRequestContext,
  ): Promise<DeviceSetupRequestResponse> {
    const created = await this.runFleetUseCase(() =>
      this.createDeviceSetupRequestUseCase.execute({
        ...payload,
        ...requester(payload, req),
        tenantId: this.tenantIdFromRequest(req),
      }),
    );
    await this.recordActivity(req, {
      entityType: "device_setup_request",
      entityId: created.id,
      action: "device_setup_request.created",
      summary: "Device setup requested",
      metadata: { referenceNumber: created.referenceNumber },
    });
    return created as unknown as DeviceSetupRequestResponse;
  }

  @Get()
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER, Role.DISPATCHER)
  @ApiOperation({
    summary: "List device setup requests",
    description: "Lists submitted device setup requests with their provisioning status timeline (My Device Requests).",
  })
  @ApiQuery({ name: "query", required: false, type: String, description: "Matches reference number, manufacturer, model, use case, status or vehicle" })
  @ApiQuery({ name: "status", required: false, enum: DEVICE_SETUP_REQUEST_STATUSES })
  @ApiOkResponse({ type: DeviceSetupRequestListResponse })
  async listDeviceSetupRequests(
    @Query() query: DeviceSetupRequestListQueryDto,
    @Req() req: FleetRequestContext,
  ): Promise<DeviceSetupRequestListResponse> {
    const requests = await this.listDeviceSetupRequestsUseCase.execute({
      query: query.query,
      status: query.status,
      tenantId: this.tenantIdFromRequest(req),
    });
    const { items, meta } = paginate(requests, query);
    return { status: true, message: "success", data: items, meta } as unknown as DeviceSetupRequestListResponse;
  }

  @Get("tracker-types")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER, Role.DISPATCHER)
  @ApiOperation({
    summary: "Tracker types",
    description: "Options for the Tracker Type dropdown on Request Device Setup, with the wording to show.",
  })
  @ApiOkResponse({ description: "Tracker type options" })
  async listTrackerTypes() {
    return {
      status: true,
      message: "success",
      data: { trackerTypes: TRACKER_TYPE_OPTIONS.map((option) => ({ ...option })) },
    };
  }

  @Get(":id")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER, Role.DISPATCHER)
  @ApiOperation({ summary: "Get device setup request" })
  @ApiOkResponse({ type: DeviceSetupRequestResponse })
  async getDeviceSetupRequest(
    @Param("id") id: string,
    @Req() req: FleetRequestContext,
  ): Promise<DeviceSetupRequestResponse> {
    return this.runFleetUseCase(() =>
      this.getDeviceSetupRequestUseCase.execute(id, this.tenantIdFromRequest(req)),
    ) as unknown as Promise<DeviceSetupRequestResponse>;
  }

  @Patch(":id/status")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({
    summary: "Advance device setup request",
    description: "Moves a request along its lifecycle (under_review → awaiting_payment → ready_for_installation → installation_in_progress → completed, or cancelled). awaiting_payment, ready_for_installation and rejected are the platform's to set and are refused here.",
  })
  @ApiOkResponse({ type: DeviceSetupRequestResponse })
  async updateDeviceSetupRequestStatus(
    @Param("id") id: string,
    @Body() payload: UpdateDeviceSetupRequestStatusDto,
    @Req() req: FleetRequestContext,
  ): Promise<DeviceSetupRequestResponse> {
    const result = await this.runFleetUseCase(() =>
      this.updateDeviceSetupRequestStatusUseCase.execute({
        id,
        status: payload.status,
        note: payload.note,
        tenantId: this.tenantIdFromRequest(req),
      }),
    ) as unknown as DeviceSetupRequestResponse;
    await this.recordActivity(req, {
      entityType: "device_setup_request",
      entityId: id,
      action: "device_setup_request.status_changed",
      summary: `Setup request ${payload.status}`,
      metadata: { status: payload.status },
    });
    return result;
  }
}

/** The signed-in person asking; a service acting for a tenant is nobody's email. */
function requester(payload: CreateDeviceSetupRequestDto, req: FleetRequestContext) {
  const person = req.user?.service ? undefined : req.user;
  return {
    requestedByUserId: person?.userId ?? null,
    requestingEmail: payload.requestingEmail?.trim() || person?.email || null,
  };
}
