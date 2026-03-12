import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { IdempotencyGuard, RequireIdempotency, Roles, RolesGuard } from "@shared/rbac";
import {
  BulkImportDriversDto,
  CreateDriverDto,
  DriverListQueryDto,
  JobListQueryDto,
  SetDriverStatusDto,
  UpdateDriverContactChannelsDto,
  UpdateDriverDto,
} from "./dto/driver.dto";
import {
  AssignDriverToVehicleDto,
  BulkImportVehiclesDto,
  CreateVehicleDto,
  DispatchSearchQueryDto,
  RegisterGpsDeviceDto,
  SetVehicleStatusDto,
  UpdateVehicleDto,
  VehicleListQueryDto,
} from "./dto/vehicle.dto";
import {
  BulkDriverImportResponse,
  BulkVehicleImportResponse,
  DispatchSearchResponse,
  DriverListResponse,
  DriverResponse,
  FleetHealthResponse,
  JobListResponse,
  JobStatusResponse,
  VehicleDriverAssignmentResponse,
  VehicleListResponse,
  VehicleResponse,
} from "./dto/fleet.schema";
import {
  BulkImportDriversUseCase,
  CreateDriverUseCase,
  DeleteDriverUseCase,
  DriverNotFoundError,
  GetDriverUseCase,
  ListDriversUseCase,
  SetDriverStatusUseCase,
  UpdateDriverContactChannelsUseCase,
  UpdateDriverUseCase,
} from "./contexts/fleet/drivers";
import { ListJobsUseCase, PublishJobStatusChangedUseCase } from "./contexts/fleet/jobs";
import { FleetRuleError } from "./contexts/fleet/shared/domain/errors/fleet-rule.error";
import {
  AssignDriverToVehicleUseCase,
  BulkImportVehiclesUseCase,
  CreateVehicleUseCase,
  DeleteVehicleUseCase,
  GetVehicleUseCase,
  ListVehiclesUseCase,
  RegisterVehicleGpsDeviceUseCase,
  SetVehicleStatusUseCase,
  UnassignDriverFromVehicleUseCase,
  UpdateVehicleUseCase,
  VehicleNotFoundError,
} from "./contexts/fleet/vehicles";

@ApiTags("Fleet")
@Controller("fleet")
@UseGuards(RolesGuard)
export class FleetController {
  constructor(
    @Inject(ListVehiclesUseCase)
    private readonly listVehiclesUseCase: ListVehiclesUseCase,
    @Inject(CreateVehicleUseCase)
    private readonly createVehicleUseCase: CreateVehicleUseCase,
    @Inject(GetVehicleUseCase)
    private readonly getVehicleUseCase: GetVehicleUseCase,
    @Inject(UpdateVehicleUseCase)
    private readonly updateVehicleUseCase: UpdateVehicleUseCase,
    @Inject(DeleteVehicleUseCase)
    private readonly deleteVehicleUseCase: DeleteVehicleUseCase,
    @Inject(AssignDriverToVehicleUseCase)
    private readonly assignDriverToVehicleUseCase: AssignDriverToVehicleUseCase,
    @Inject(UnassignDriverFromVehicleUseCase)
    private readonly unassignDriverFromVehicleUseCase: UnassignDriverFromVehicleUseCase,
    @Inject(SetVehicleStatusUseCase)
    private readonly setVehicleStatusUseCase: SetVehicleStatusUseCase,
    @Inject(RegisterVehicleGpsDeviceUseCase)
    private readonly registerVehicleGpsDeviceUseCase: RegisterVehicleGpsDeviceUseCase,
    @Inject(BulkImportVehiclesUseCase)
    private readonly bulkImportVehiclesUseCase: BulkImportVehiclesUseCase,
    @Inject(ListDriversUseCase)
    private readonly listDriversUseCase: ListDriversUseCase,
    @Inject(CreateDriverUseCase)
    private readonly createDriverUseCase: CreateDriverUseCase,
    @Inject(GetDriverUseCase)
    private readonly getDriverUseCase: GetDriverUseCase,
    @Inject(UpdateDriverUseCase)
    private readonly updateDriverUseCase: UpdateDriverUseCase,
    @Inject(DeleteDriverUseCase)
    private readonly deleteDriverUseCase: DeleteDriverUseCase,
    @Inject(SetDriverStatusUseCase)
    private readonly setDriverStatusUseCase: SetDriverStatusUseCase,
    @Inject(UpdateDriverContactChannelsUseCase)
    private readonly updateDriverContactChannelsUseCase: UpdateDriverContactChannelsUseCase,
    @Inject(BulkImportDriversUseCase)
    private readonly bulkImportDriversUseCase: BulkImportDriversUseCase,
    @Inject(ListJobsUseCase)
    private readonly listJobsUseCase: ListJobsUseCase,
    @Inject(PublishJobStatusChangedUseCase)
    private readonly publishJobStatusChangedUseCase: PublishJobStatusChangedUseCase,
  ) {}

  /** Health check */
  @Get("health")
  health(): FleetHealthResponse {
    return { status: true, message: "success", data: { service: "fleet" } };
  }

  /** Retrieve vehicles with optional dispatch-centric filters */
  @Get("vehicles")
  @Roles("admin", "fleet_manager", "operator", "dispatcher")
  @ApiOperation({
    summary: "List vehicles",
    description: "Epic C (US-C01, US-C04, US-C06): list/search/filter fleet vehicles.",
  })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiQuery({ name: "status", required: false, enum: ["active", "inactive"] })
  @ApiQuery({ name: "assigned", required: false, enum: ["true", "false"] })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiOkResponse({ type: VehicleListResponse })
  @ApiBadRequestResponse({ description: "Invalid query parameter values" })
  async listVehicles(@Query() query: VehicleListQueryDto): Promise<VehicleListResponse> {
    return this.listVehiclesUseCase.execute({
      query: query.query,
      status: query.status,
      assigned: this.parseOptionalBoolean(query.assigned, "assigned"),
      tenantId: query.tenantId,
    }) as unknown as Promise<VehicleListResponse>;
  }

  /** Register a new vehicle in the fleet */
  @Post("vehicles")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Create vehicle",
    description: "Epic C (US-C01): create a new fleet vehicle.",
  })
  @ApiCreatedResponse({ type: VehicleResponse })
  async createVehicle(@Body() payload: CreateVehicleDto): Promise<VehicleResponse> {
    return this.createVehicleUseCase.execute(payload) as unknown as Promise<VehicleResponse>;
  }

  /** Bulk onboarding for fleet inventory imports */
  @Post("vehicles/import")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Bulk import vehicles",
    description: "Epic C (US-C05): bulk upsert vehicles by plate number.",
  })
  @ApiCreatedResponse({ type: BulkVehicleImportResponse })
  async bulkImportVehicles(@Body() payload: BulkImportVehiclesDto): Promise<BulkVehicleImportResponse> {
    return this.bulkImportVehiclesUseCase.execute(payload) as unknown as Promise<BulkVehicleImportResponse>;
  }

  /** Retrieve a vehicle by ID */
  @Get("vehicles/:id")
  @Roles("admin", "fleet_manager", "operator", "dispatcher")
  @ApiOperation({ summary: "Get vehicle by ID" })
  @ApiOkResponse({ type: VehicleResponse })
  async getVehicle(@Param("id") id: string): Promise<VehicleResponse> {
    return this.runFleetUseCase(() => this.getVehicleUseCase.execute(id)) as unknown as Promise<VehicleResponse>;
  }

  /** Partially update a vehicle's details */
  @Patch("vehicles/:id")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Update vehicle" })
  @ApiOkResponse({ type: VehicleResponse })
  async updateVehicle(@Param("id") id: string, @Body() payload: UpdateVehicleDto): Promise<VehicleResponse> {
    return this.runFleetUseCase(() =>
      this.updateVehicleUseCase.execute({ id, ...payload }),
    ) as unknown as Promise<VehicleResponse>;
  }

  /** Activate/deactivate vehicle availability for dispatch */
  @Patch("vehicles/:id/status")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Set vehicle status",
    description: "Epic C (US-C04): activate/deactivate vehicle availability.",
  })
  @ApiOkResponse({ type: VehicleResponse })
  async setVehicleStatus(@Param("id") id: string, @Body() payload: SetVehicleStatusDto): Promise<VehicleResponse> {
    return this.runFleetUseCase(() =>
      this.setVehicleStatusUseCase.execute({ id, status: payload.status }),
    ) as unknown as Promise<VehicleResponse>;
  }

  /** Assign a driver to a vehicle (US-C03) */
  @Patch("vehicles/:id/assignment")
  @Roles("admin", "fleet_manager", "dispatcher")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Assign driver to vehicle",
    description: "Epic C (US-C03): assign a driver record to a vehicle record.",
  })
  @ApiOkResponse({ type: VehicleDriverAssignmentResponse })
  @ApiBadRequestResponse({ description: "Invalid assignment rule (tenant/state mismatch)" })
  async assignDriverToVehicle(
    @Param("id") vehicleId: string,
    @Body() payload: AssignDriverToVehicleDto,
  ): Promise<VehicleDriverAssignmentResponse> {
    return this.runFleetUseCase(() =>
      this.assignDriverToVehicleUseCase.execute({ vehicleId, driverId: payload.driverId }),
    ) as unknown as Promise<VehicleDriverAssignmentResponse>;
  }

  /** Remove current driver assignment from a vehicle */
  @Delete("vehicles/:id/assignment")
  @Roles("admin", "fleet_manager", "dispatcher")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Unassign driver from vehicle" })
  @ApiOkResponse({ type: VehicleResponse })
  async unassignDriverFromVehicle(@Param("id") vehicleId: string): Promise<VehicleResponse> {
    return this.runFleetUseCase(() =>
      this.unassignDriverFromVehicleUseCase.execute(vehicleId),
    ) as unknown as Promise<VehicleResponse>;
  }

  /** Register or replace GPS hardware mapped to a vehicle */
  @Patch("vehicles/:id/gps-device")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Register GPS device on vehicle",
    description: "Epic C (US-C08): map a GPS device to a vehicle.",
  })
  @ApiOkResponse({ type: VehicleResponse })
  async registerGpsDevice(
    @Param("id") vehicleId: string,
    @Body() payload: RegisterGpsDeviceDto,
  ): Promise<VehicleResponse> {
    return this.runFleetUseCase(() =>
      this.registerVehicleGpsDeviceUseCase.execute({ vehicleId, ...payload }),
    ) as unknown as Promise<VehicleResponse>;
  }

  /** Remove a vehicle from the fleet */
  @Delete("vehicles/:id")
  @Roles("admin")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Delete vehicle" })
  @ApiOkResponse({ type: VehicleResponse })
  async deleteVehicle(@Param("id") id: string): Promise<VehicleResponse> {
    return this.runFleetUseCase(() =>
      this.deleteVehicleUseCase.execute(id),
    ) as unknown as Promise<VehicleResponse>;
  }

  /** Retrieve drivers with optional dispatch-centric filters */
  @Get("drivers")
  @Roles("admin", "fleet_manager", "operator", "dispatcher")
  @ApiOperation({
    summary: "List drivers",
    description: "Epic C (US-C02, US-C04, US-C06): list/search/filter drivers.",
  })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiQuery({ name: "status", required: false, enum: ["active", "inactive"] })
  @ApiQuery({ name: "assigned", required: false, enum: ["true", "false"] })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiOkResponse({ type: DriverListResponse })
  @ApiBadRequestResponse({ description: "Invalid query parameter values" })
  async listDrivers(@Query() query: DriverListQueryDto): Promise<DriverListResponse> {
    return this.listDriversUseCase.execute({
      query: query.query,
      status: query.status,
      assigned: this.parseOptionalBoolean(query.assigned, "assigned"),
      tenantId: query.tenantId,
    }) as unknown as Promise<DriverListResponse>;
  }

  /** Register a new driver */
  @Post("drivers")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Create driver",
    description: "Epic C (US-C02): create a new driver record.",
  })
  @ApiCreatedResponse({ type: DriverResponse })
  async createDriver(@Body() payload: CreateDriverDto): Promise<DriverResponse> {
    return this.createDriverUseCase.execute(payload) as unknown as Promise<DriverResponse>;
  }

  /** Bulk onboarding for driver records */
  @Post("drivers/import")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Bulk import drivers",
    description: "Epic C (US-C05): bulk upsert drivers by license number.",
  })
  @ApiCreatedResponse({ type: BulkDriverImportResponse })
  async bulkImportDrivers(@Body() payload: BulkImportDriversDto): Promise<BulkDriverImportResponse> {
    return this.bulkImportDriversUseCase.execute(payload) as unknown as Promise<BulkDriverImportResponse>;
  }

  /** Retrieve a driver by ID */
  @Get("drivers/:id")
  @Roles("admin", "fleet_manager", "operator", "dispatcher")
  @ApiOperation({ summary: "Get driver by ID" })
  @ApiOkResponse({ type: DriverResponse })
  async getDriver(@Param("id") id: string): Promise<DriverResponse> {
    return this.runFleetUseCase(() => this.getDriverUseCase.execute(id)) as unknown as Promise<DriverResponse>;
  }

  /** Partially update a driver's details */
  @Patch("drivers/:id")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Update driver" })
  @ApiOkResponse({ type: DriverResponse })
  async updateDriver(@Param("id") id: string, @Body() payload: UpdateDriverDto): Promise<DriverResponse> {
    return this.runFleetUseCase(() =>
      this.updateDriverUseCase.execute({ id, ...payload }),
    ) as unknown as Promise<DriverResponse>;
  }

  /** Activate/deactivate driver availability for dispatch */
  @Patch("drivers/:id/status")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Set driver status",
    description: "Epic C (US-C04): activate/deactivate driver availability.",
  })
  @ApiOkResponse({ type: DriverResponse })
  async setDriverStatus(@Param("id") id: string, @Body() payload: SetDriverStatusDto): Promise<DriverResponse> {
    return this.runFleetUseCase(() =>
      this.setDriverStatusUseCase.execute({ id, status: payload.status }),
    ) as unknown as Promise<DriverResponse>;
  }

  /** Manage WhatsApp/SMS/voice contact channels used for dispatch communication */
  @Patch("drivers/:id/contact-channels")
  @Roles("admin", "fleet_manager", "dispatcher")
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
  ): Promise<DriverResponse> {
    return this.runFleetUseCase(() =>
      this.updateDriverContactChannelsUseCase.execute({ id, channels: payload }),
    ) as unknown as Promise<DriverResponse>;
  }

  /** Remove a driver record */
  @Delete("drivers/:id")
  @Roles("admin")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({ summary: "Delete driver" })
  @ApiOkResponse({ type: DriverResponse })
  async deleteDriver(@Param("id") id: string): Promise<DriverResponse> {
    return this.runFleetUseCase(() =>
      this.deleteDriverUseCase.execute(id),
    ) as unknown as Promise<DriverResponse>;
  }

  /** List jobs for dispatch search/filter use-cases */
  @Get("jobs")
  @Roles("admin", "fleet_manager", "operator", "dispatcher")
  @ApiOperation({
    summary: "List jobs",
    description: "Epic C (US-C06): filter/search jobs for dispatch views.",
  })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiQuery({ name: "status", required: false, type: String })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiOkResponse({ type: JobListResponse })
  async listJobs(@Query() query: JobListQueryDto): Promise<JobListResponse> {
    return this.listJobsUseCase.execute({
      query: query.query,
      status: query.status,
      tenantId: query.tenantId,
    }) as unknown as Promise<JobListResponse>;
  }

  /** Combined dispatcher search over vehicles, drivers, and jobs */
  @Get("dispatch/search")
  @Roles("admin", "fleet_manager", "operator", "dispatcher")
  @ApiOperation({
    summary: "Dispatch search",
    description: "Epic C (US-C06): combined search/filter over vehicles, drivers, and jobs.",
  })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiQuery({ name: "vehicleStatus", required: false, enum: ["active", "inactive"] })
  @ApiQuery({ name: "driverStatus", required: false, enum: ["active", "inactive"] })
  @ApiQuery({ name: "jobStatus", required: false, type: String })
  @ApiQuery({ name: "assignedOnly", required: false, enum: ["true", "false"] })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiOkResponse({ type: DispatchSearchResponse })
  @ApiBadRequestResponse({ description: "Invalid query parameter values" })
  async searchDispatch(@Query() query: DispatchSearchQueryDto): Promise<DispatchSearchResponse> {
    const assignedOnly = this.parseOptionalBoolean(query.assignedOnly, "assignedOnly");

    // Run in parallel because this endpoint is read-only aggregation across three repositories.
    const [vehicles, drivers, jobs] = await Promise.all([
      this.listVehiclesUseCase.execute({
        query: query.query,
        status: query.vehicleStatus,
        assigned: assignedOnly,
        tenantId: query.tenantId,
      }),
      this.listDriversUseCase.execute({
        query: query.query,
        status: query.driverStatus,
        assigned: assignedOnly,
        tenantId: query.tenantId,
      }),
      this.listJobsUseCase.execute({
        query: query.query,
        status: query.jobStatus,
        tenantId: query.tenantId,
      }),
    ]);

    return { vehicles, drivers, jobs } as unknown as DispatchSearchResponse;
  }

  /** Emit a job-status-changed domain event to the event bus */
  @Post("events/job-status")
  @Roles("admin", "fleet_manager", "dispatcher")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  @ApiOperation({
    summary: "Publish job status event",
    description: "Records job status snapshot and emits job.status.changed event.",
  })
  @ApiCreatedResponse({ type: JobStatusResponse })
  async publishSampleEvent(
    @Query("jobId") jobId = "demo-job",
    @Query("status") status = "assigned",
    @Query("tenant") tenant?: string,
  ): Promise<JobStatusResponse> {
    return this.publishJobStatusChangedUseCase.execute({
      jobId,
      status,
      tenantId: tenant,
    }) as unknown as Promise<JobStatusResponse>;
  }

  private parseOptionalBoolean(
    value: string | undefined,
    field: string,
  ): boolean | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
    throw new BadRequestException(`${field} must be either "true" or "false"`);
  }

  private async runFleetUseCase<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof VehicleNotFoundError || error instanceof DriverNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof FleetRuleError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
