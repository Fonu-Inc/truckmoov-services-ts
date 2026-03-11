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
  async createVehicle(@Body() payload: CreateVehicleDto): Promise<VehicleResponse> {
    return this.createVehicleUseCase.execute(payload) as unknown as Promise<VehicleResponse>;
  }

  /** Bulk onboarding for fleet inventory imports */
  @Post("vehicles/import")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  async bulkImportVehicles(@Body() payload: BulkImportVehiclesDto): Promise<BulkVehicleImportResponse> {
    return this.bulkImportVehiclesUseCase.execute(payload) as unknown as Promise<BulkVehicleImportResponse>;
  }

  /** Retrieve a vehicle by ID */
  @Get("vehicles/:id")
  @Roles("admin", "fleet_manager", "operator", "dispatcher")
  async getVehicle(@Param("id") id: string): Promise<VehicleResponse> {
    return this.runFleetUseCase(() => this.getVehicleUseCase.execute(id)) as unknown as Promise<VehicleResponse>;
  }

  /** Partially update a vehicle's details */
  @Patch("vehicles/:id")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
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
  async deleteVehicle(@Param("id") id: string): Promise<VehicleResponse> {
    return this.runFleetUseCase(() =>
      this.deleteVehicleUseCase.execute(id),
    ) as unknown as Promise<VehicleResponse>;
  }

  /** Retrieve drivers with optional dispatch-centric filters */
  @Get("drivers")
  @Roles("admin", "fleet_manager", "operator", "dispatcher")
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
  async createDriver(@Body() payload: CreateDriverDto): Promise<DriverResponse> {
    return this.createDriverUseCase.execute(payload) as unknown as Promise<DriverResponse>;
  }

  /** Bulk onboarding for driver records */
  @Post("drivers/import")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  async bulkImportDrivers(@Body() payload: BulkImportDriversDto): Promise<BulkDriverImportResponse> {
    return this.bulkImportDriversUseCase.execute(payload) as unknown as Promise<BulkDriverImportResponse>;
  }

  /** Retrieve a driver by ID */
  @Get("drivers/:id")
  @Roles("admin", "fleet_manager", "operator", "dispatcher")
  async getDriver(@Param("id") id: string): Promise<DriverResponse> {
    return this.runFleetUseCase(() => this.getDriverUseCase.execute(id)) as unknown as Promise<DriverResponse>;
  }

  /** Partially update a driver's details */
  @Patch("drivers/:id")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
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
  async deleteDriver(@Param("id") id: string): Promise<DriverResponse> {
    return this.runFleetUseCase(() =>
      this.deleteDriverUseCase.execute(id),
    ) as unknown as Promise<DriverResponse>;
  }

  /** List jobs for dispatch search/filter use-cases */
  @Get("jobs")
  @Roles("admin", "fleet_manager", "operator", "dispatcher")
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
