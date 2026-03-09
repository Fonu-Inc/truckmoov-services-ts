import {
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
import { CreateDriverDto, UpdateDriverDto } from "./dto/driver.dto";
import { CreateVehicleDto, UpdateVehicleDto } from "./dto/vehicle.dto";
import {
  DriverListResponse,
  DriverResponse,
  FleetHealthResponse,
  JobStatusResponse,
  VehicleListResponse,
  VehicleResponse,
} from "./dto/fleet.schema";
import {
  CreateDriverUseCase,
  DeleteDriverUseCase,
  DriverNotFoundError,
  GetDriverUseCase,
  ListDriversUseCase,
  UpdateDriverUseCase,
} from "./contexts/fleet/drivers";
import { PublishJobStatusChangedUseCase } from "./contexts/fleet/jobs";
import {
  CreateVehicleUseCase,
  DeleteVehicleUseCase,
  GetVehicleUseCase,
  ListVehiclesUseCase,
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
    @Inject(PublishJobStatusChangedUseCase)
    private readonly publishJobStatusChangedUseCase: PublishJobStatusChangedUseCase,
  ) {}

  /** Health check */
  @Get("health")
  health(): FleetHealthResponse {
    return { status: true, message: "success", data: { service: "fleet" } };
  }

  /** Retrieve all vehicles for the current tenant */
  @Get("vehicles")
  @Roles("admin", "fleet_manager", "operator")
  async listVehicles(): Promise<VehicleListResponse> {
    return this.listVehiclesUseCase.execute() as unknown as Promise<VehicleListResponse>;
  }

  /** Register a new vehicle in the fleet */
  @Post("vehicles")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  async createVehicle(@Body() payload: CreateVehicleDto): Promise<VehicleResponse> {
    return this.createVehicleUseCase.execute(payload) as unknown as Promise<VehicleResponse>;
  }

  /** Retrieve a vehicle by ID */
  @Get("vehicles/:id")
  @Roles("admin", "fleet_manager", "operator")
  async getVehicle(@Param("id") id: string): Promise<VehicleResponse> {
    return this.runVehicleUseCase(() => this.getVehicleUseCase.execute(id)) as unknown as Promise<VehicleResponse>;
  }

  /** Partially update a vehicle's details */
  @Patch("vehicles/:id")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  async updateVehicle(@Param("id") id: string, @Body() payload: UpdateVehicleDto): Promise<VehicleResponse> {
    return this.runVehicleUseCase(() =>
      this.updateVehicleUseCase.execute({ id, ...payload }),
    ) as unknown as Promise<VehicleResponse>;
  }

  /** Remove a vehicle from the fleet */
  @Delete("vehicles/:id")
  @Roles("admin")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  async deleteVehicle(@Param("id") id: string): Promise<VehicleResponse> {
    return this.runVehicleUseCase(() =>
      this.deleteVehicleUseCase.execute(id),
    ) as unknown as Promise<VehicleResponse>;
  }

  /** Retrieve all drivers for the current tenant */
  @Get("drivers")
  @Roles("admin", "fleet_manager", "operator")
  async listDrivers(): Promise<DriverListResponse> {
    return this.listDriversUseCase.execute() as unknown as Promise<DriverListResponse>;
  }

  /** Register a new driver */
  @Post("drivers")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  async createDriver(@Body() payload: CreateDriverDto): Promise<DriverResponse> {
    return this.createDriverUseCase.execute(payload) as unknown as Promise<DriverResponse>;
  }

  /** Retrieve a driver by ID */
  @Get("drivers/:id")
  @Roles("admin", "fleet_manager", "operator")
  async getDriver(@Param("id") id: string): Promise<DriverResponse> {
    return this.runDriverUseCase(() => this.getDriverUseCase.execute(id)) as unknown as Promise<DriverResponse>;
  }

  /** Partially update a driver's details */
  @Patch("drivers/:id")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  async updateDriver(@Param("id") id: string, @Body() payload: UpdateDriverDto): Promise<DriverResponse> {
    return this.runDriverUseCase(() =>
      this.updateDriverUseCase.execute({ id, ...payload }),
    ) as unknown as Promise<DriverResponse>;
  }

  /** Remove a driver record */
  @Delete("drivers/:id")
  @Roles("admin")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  async deleteDriver(@Param("id") id: string): Promise<DriverResponse> {
    return this.runDriverUseCase(() =>
      this.deleteDriverUseCase.execute(id),
    ) as unknown as Promise<DriverResponse>;
  }

  /** Emit a job-status-changed domain event to the event bus */
  @Post("events/job-status")
  @Roles("admin", "fleet_manager")
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

  private async runVehicleUseCase<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof VehicleNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  private async runDriverUseCase<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof DriverNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
