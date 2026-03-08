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
import {
  IdempotencyGuard,
  RequireIdempotency,
  Roles,
  RolesGuard,
} from "../../../libs/shared/rbac/src";
import { CreateDriverDto, UpdateDriverDto } from "./dto/driver.dto";
import { CreateVehicleDto, UpdateVehicleDto } from "./dto/vehicle.dto";
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
    // Explicit injections avoid hidden runtime coupling on decorator metadata emission.
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

  @Get("health")
  health() {
    return { status: "ok", service: "fleet" };
  }

  @Get("vehicles")
  @Roles("admin", "fleet_manager", "operator")
  async listVehicles() {
    return this.listVehiclesUseCase.execute();
  }

  @Post("vehicles")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  async createVehicle(@Body() payload: CreateVehicleDto) {
    return this.createVehicleUseCase.execute(payload);
  }

  @Get("vehicles/:id")
  @Roles("admin", "fleet_manager", "operator")
  async getVehicle(@Param("id") id: string) {
    return this.runVehicleUseCase(() => this.getVehicleUseCase.execute(id));
  }

  @Patch("vehicles/:id")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  async updateVehicle(@Param("id") id: string, @Body() payload: UpdateVehicleDto) {
    return this.runVehicleUseCase(() =>
      this.updateVehicleUseCase.execute({
        id,
        ...payload,
      }),
    );
  }

  @Delete("vehicles/:id")
  @Roles("admin")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  async deleteVehicle(@Param("id") id: string) {
    return this.runVehicleUseCase(() => this.deleteVehicleUseCase.execute(id));
  }

  @Get("drivers")
  @Roles("admin", "fleet_manager", "operator")
  async listDrivers() {
    return this.listDriversUseCase.execute();
  }

  @Post("drivers")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  async createDriver(@Body() payload: CreateDriverDto) {
    return this.createDriverUseCase.execute(payload);
  }

  @Get("drivers/:id")
  @Roles("admin", "fleet_manager", "operator")
  async getDriver(@Param("id") id: string) {
    return this.runDriverUseCase(() => this.getDriverUseCase.execute(id));
  }

  @Patch("drivers/:id")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  async updateDriver(@Param("id") id: string, @Body() payload: UpdateDriverDto) {
    return this.runDriverUseCase(() =>
      this.updateDriverUseCase.execute({
        id,
        ...payload,
      }),
    );
  }

  @Delete("drivers/:id")
  @Roles("admin")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  async deleteDriver(@Param("id") id: string) {
    return this.runDriverUseCase(() => this.deleteDriverUseCase.execute(id));
  }

  @Post("events/job-status")
  @Roles("admin", "fleet_manager")
  @RequireIdempotency()
  @UseGuards(IdempotencyGuard)
  publishSampleEvent(
    @Query("jobId") jobId = "demo-job",
    @Query("status") status = "assigned",
    @Query("tenant") tenant?: string,
  ) {
    return this.publishJobStatusChangedUseCase.execute({
      jobId,
      status,
      tenantId: tenant,
    });
  }

  private async runVehicleUseCase<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      // Keep HTTP translation at the interface layer; domain stays framework-agnostic.
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
      // Same boundary rule for driver aggregate failures.
      if (error instanceof DriverNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
