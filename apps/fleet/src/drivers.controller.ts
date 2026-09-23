import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Body,
  NotFoundException,
  ConflictException,
  ServiceUnavailableException,
  Param,
  Inject,
  Get,
  Req,
  Res,
  Patch,
  Delete,
  Controller,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Post,
  Query,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { MAX_DOCUMENT_UPLOAD_BYTES, uploadLimits } from "@shared/http";
import {
  ApiBody,
  ApiConsumes,
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
import {
  VEHICLE_REPOSITORY,
  type VehicleRepository,
} from "./contexts/fleet/vehicles/domain/repositories/vehicle.repository";
import {
  CONSENT_CHANNELS,
  type ConsentChannel,
} from "./contexts/fleet/drivers/domain/driver-consent.repository";
import {
  DriverConsentRequiredError,
  DriverMessagingUseCase,
} from "./contexts/fleet/drivers/application/use-cases/driver-messaging.use-case";
import { DriverMessageDispatchError } from "./contexts/fleet/drivers/infrastructure/http-driver-messenger";
import { DriverDetailUseCase } from "./contexts/fleet/drivers/application/use-cases/driver-detail.use-case";
import { DriverBehaviorUseCase } from "./contexts/fleet/drivers/application/use-cases/driver-behavior.use-case";
import { DriverFatigueUseCase } from "./contexts/fleet/drivers/application/use-cases/driver-fatigue.use-case";
import {
  buildDriverCsvExport,
  buildDriverCsvTemplate,
  parseDriverCsv,
  DRIVER_CSV_COLUMNS,
} from "./contexts/fleet/drivers/domain/driver-csv";
import {
  applyDriverRosterFilters,
  buildDriverAllowance,
  ownedDriverIdsFrom,
  scoreBandFor,
  summarizeDriverStatuses,
  tripBandFor,
  DRIVER_SCORE_BANDS,
  DRIVER_TRIP_BANDS,
  type DriverRosterRow,
} from "./contexts/fleet/drivers/domain/driver-roster";
import {
  DRIVER_QUOTA_READER,
  type DriverQuotaReader,
} from "./contexts/fleet/drivers/domain/ports/driver-quota-reader.port";
import { Portals } from "@shared/access";
import {
  DISPATCH_JOBS_READER,
  type DispatchJobsReader,
} from "./contexts/fleet/dispatch/domain/ports/dispatch-jobs-reader.port";
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
  SuspendDriverDto,
  RecordDriverConsentDto,
  SendDriverMessageDto,
  RecordBehaviorEventDto,
  MarkAlertsReadDto,
  RunFatigueAnalysisDto,
} from "./dto/driver.dto";
import { BulkDriverImportResponse, DriverListResponse, DriverResponse } from "./dto/fleet.schema";
import { TenantScoped } from "./tenant-scoped.decorator";

@ApiTags("Drivers")
@Portals("tenant")
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
    @Inject(DRIVER_QUOTA_READER) private readonly driverQuotaReader: DriverQuotaReader,
    @Inject(DISPATCH_JOBS_READER) private readonly dispatchJobs: DispatchJobsReader,
    @Inject(DriverMessagingUseCase) private readonly driverMessagingUseCase: DriverMessagingUseCase,
    @Inject(DriverDetailUseCase) private readonly driverDetailUseCase: DriverDetailUseCase,
    @Inject(DriverBehaviorUseCase) private readonly driverBehaviorUseCase: DriverBehaviorUseCase,
    @Inject(DriverFatigueUseCase) private readonly driverFatigueUseCase: DriverFatigueUseCase,
    @Inject(VEHICLE_REPOSITORY) private readonly vehicleRepository: VehicleRepository,
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
    const tenantId = this.tenantIdFromRequest(req);
    const roster = await this.buildRoster(tenantId, query, req);
    return { status: true, message: "success", data: roster.items } as unknown as DriverListResponse;
  }

  @Get("summary")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER)
  @ApiOperation({
    summary: "Driver roster summary",
    description:
      "Status counts and the plan allowance behind the five cards at the top of the Drivers tab.",
  })
  @ApiOkResponse({ description: "Roster summary" })
  async getDriverSummary(@Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const [drivers, limit, owned] = await Promise.all([
      this.listDriversUseCase.execute({ tenantId }),
      this.driverQuotaReader.findDriverLimit(tenantId),
      this.ownedDriverIds(tenantId, req),
    ]);

    const scoped = (drivers as unknown as Array<Record<string, unknown>>).filter(
      (driver) => owned === null || owned.has(String(driver["id"])),
    );
    const counts = summarizeDriverStatuses(scoped as unknown as Array<{ status: string }>);
    return {
      status: true,
      message: "success",
      // The allowance counts every driver on the roster, suspended included: a
      // suspended driver still occupies a seat until they are deleted.
      data: { ...counts, allowance: buildDriverAllowance(limit, counts.total) },
    };
  }

  @Get("filters")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER)
  @ApiOperation({
    summary: "Roster filter options",
    description: "The score bands, trip bands and channels the filter panel offers.",
  })
  @ApiOkResponse({ description: "Filter options" })
  async getDriverFilterOptions() {
    return {
      status: true,
      message: "success",
      data: {
        scoreBands: DRIVER_SCORE_BANDS,
        tripBands: DRIVER_TRIP_BANDS,
        channels: ["whatsapp", "sms", "voice", "email"],
        statuses: ["active", "available", "offline", "suspended"],
      },
    };
  }

  @Get("export")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR)
  @ApiOperation({
    summary: "Export drivers as CSV",
    description: "Same columns as the bulk import template, so an export can be edited and imported back.",
  })
  @ApiOkResponse({ description: "CSV file", content: { "text/csv": {} } })
  async exportDrivers(
    @Query() query: DriverListQueryDto,
    @Req() req: FleetRequestContext,
    @Res({ passthrough: false }) res: any,
  ): Promise<void> {
    const tenantId = this.tenantIdFromRequest(req);
    const roster = await this.buildRoster(tenantId, query, req);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=drivers.csv");
    res.send(
      buildDriverCsvExport(
        roster.raw.map((driver) => ({
          firstName: String(driver["firstName"] ?? ""),
          lastName: String(driver["lastName"] ?? ""),
          phone: (driver["phone"] as string | null) ?? null,
          email: (driver["email"] as string | null) ?? null,
          licenseNumber: String(driver["licenseNumber"] ?? ""),
          licenseExpiryDate: (driver["licenseExpiryDate"] as string | null) ?? null,
          preferredChannel: (driver["communicationPreference"] as string | null) ?? null,
          status: (driver["status"] as string | null) ?? null,
        })),
      ),
    );
  }

  @Get("import/template")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR)
  @ApiOperation({ summary: "Download the bulk upload CSV template" })
  @ApiOkResponse({ description: "CSV file", content: { "text/csv": {} } })
  async downloadDriverTemplate(@Res({ passthrough: false }) res: any): Promise<void> {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=driver-import-template.csv");
    res.send(buildDriverCsvTemplate());
  }

  @Get("import/columns")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR)
  @ApiOperation({ summary: "Describe the bulk upload columns" })
  @ApiOkResponse({ description: "Column definitions" })
  async describeDriverImportColumns() {
    return { status: true, message: "success", data: { columns: DRIVER_CSV_COLUMNS } };
  }

  /**
   * Trip counts come from dispatch in one call for the whole roster rather than
   * one per driver: a hundred drivers must not become a hundred round trips.
   */
  private async buildRoster(tenantId: string, query: DriverListQueryDto, req?: FleetRequestContext) {
    const owned = req ? await this.ownedDriverIds(tenantId, req) : null;
    const [drivers, jobs] = await Promise.all([
      this.listDriversUseCase.execute({
        tenantId,
        status: normalizeDriverStatus(query.status),
        assigned: this.parseOptionalBoolean(query.assigned, "assigned"),
      }),
      this.dispatchJobs.listJobs(tenantId),
    ]);

    const tripsByDriver = new Map<string, number>();
    for (const job of jobs) {
      if (!job.assignedDriverId) continue;
      tripsByDriver.set(job.assignedDriverId, (tripsByDriver.get(job.assignedDriverId) ?? 0) + 1);
    }

    const raw = (drivers as unknown as Array<Record<string, unknown>>).filter(
      (driver) => owned === null || owned.has(String(driver["id"])),
    );
    const rows: DriverRosterRow[] = raw.map((driver) => {
      const id = String(driver["id"]);
      const behaviorScore = (driver["performanceScore"] as number | null) ?? null;
      const trips = tripsByDriver.get(id) ?? 0;
      return {
        id,
        name: String(driver["name"] ?? ""),
        phone: (driver["phone"] as string | null) ?? null,
        email: (driver["email"] as string | null) ?? null,
        licenseNumber: String(driver["licenseNumber"] ?? ""),
        status: String(driver["status"] ?? ""),
        behaviorScore,
        trips,
        preferredChannel: String(driver["communicationPreference"] ?? "whatsapp"),
      };
    });

    const filtered = applyDriverRosterFilters(rows, {
      query: query.query,
      scoreBand: query.scoreBand,
      tripBand: query.tripBand,
      preferredChannel: query.preferredChannel,
    });
    const keep = new Set(filtered.map((row) => row.id));

    return {
      raw: raw.filter((driver) => keep.has(String(driver["id"]))),
      items: filtered.map((row) => ({
        ...raw.find((driver) => String(driver["id"]) === row.id),
        behaviorScore: row.behaviorScore,
        scoreBand: scoreBandFor(row.behaviorScore),
        trips: row.trips,
        tripBand: tripBandFor(row.trips),
        preferredChannel: row.preferredChannel,
      })),
    };
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
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" } } },
  })
  @ApiCreatedResponse({ type: BulkDriverImportResponse })
  @ApiBadRequestResponse({ description: "Missing file, or the CSV is not readable" })
  @UseInterceptors(FileInterceptor("file", uploadLimits(MAX_DOCUMENT_UPLOAD_BYTES)))
  async bulkImportDrivers(
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
    @Req() req: FleetRequestContext,
  ): Promise<BulkDriverImportResponse> {
    if (!file?.buffer?.length) {
      throw new BadRequestException("Missing CSV file");
    }

    let parsed: ReturnType<typeof parseDriverCsv>;
    try {
      parsed = parseDriverCsv(file.buffer.toString("utf8"));
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "The CSV could not be read");
    }

    if (parsed.rows.length === 0) {
      throw new BadRequestException(
        parsed.errors.length > 0
          ? `No importable rows. First problem on line ${parsed.errors[0].line}: ${parsed.errors[0].message}`
          : "The CSV contained no driver rows",
      );
    }

    const result = await this.bulkImportDriversUseCase.execute({
      items: parsed.rows.map((row) => ({
        firstName: row.firstName,
        lastName: row.lastName,
        name: `${row.firstName} ${row.lastName}`,
        phone: row.phone ?? undefined,
        email: row.email ?? undefined,
        licenseNumber: row.licenseNumber,
        licenseExpiryDate: row.licenseExpiryDate ?? undefined,
        communicationPreference: (row.preferredChannel ?? undefined) as never,
        status: (row.status ?? undefined) as never,
      })),
      tenantId: this.tenantIdFromRequest(req),
    });
    (result as unknown as Record<string, unknown>)["skipped"] = parsed.errors;
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

  @Post(":id/suspend")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN)
  @ApiOperation({
    summary: "Suspend a driver",
    description:
      "Suspends the driver and releases any vehicle assignment. A suspended driver keeps their seat on the plan until deleted.",
  })
  @ApiOkResponse({ type: DriverResponse })
  async suspendDriver(
    @Param("id") id: string,
    @Body() payload: SuspendDriverDto,
    @Req() req: FleetRequestContext,
  ): Promise<DriverResponse> {
    const tenantId = this.tenantIdFromRequest(req);
    await this.assertDriverInScope(tenantId, req, id);
    const result = await this.setDriverStatusUseCase.execute({ id, tenantId, status: "suspended" });
    await this.recordActivity(req, {
      entityType: "driver",
      entityId: id,
      action: "driver.suspended",
      summary: payload?.reason ? `Driver suspended: ${payload.reason}` : "Driver suspended",
      metadata: { reason: payload?.reason ?? null },
    });
    return result as unknown as DriverResponse;
  }

  @Post(":id/reinstate")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN)
  @ApiOperation({
    summary: "Reinstate a suspended driver",
    description: "Returns the driver to available. They are not re-assigned to their previous vehicle.",
  })
  @ApiOkResponse({ type: DriverResponse })
  async reinstateDriver(@Param("id") id: string, @Req() req: FleetRequestContext): Promise<DriverResponse> {
    const tenantId = this.tenantIdFromRequest(req);
    await this.assertDriverInScope(tenantId, req, id);
    const result = await this.setDriverStatusUseCase.execute({ id, tenantId, status: "available" });
    await this.recordActivity(req, {
      entityType: "driver",
      entityId: id,
      action: "driver.reinstated",
      summary: "Driver reinstated",
    });
    return result as unknown as DriverResponse;
  }

  @Get(":id/consent")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER)
  @ApiOperation({
    summary: "Messaging consent for a driver",
    description:
      "WhatsApp and SMS consent state. WhatsApp needs an explicit opt-in before anything can be sent; SMS is permitted until the driver opts out.",
  })
  @ApiOkResponse({ description: "Consent state per channel" })
  async getDriverConsent(@Param("id") id: string, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    await this.assertDriverInScope(tenantId, req, id);
    const data = await this.driverMessagingUseCase.listConsent(tenantId, id);
    return { status: true, message: "success", data };
  }

  @Post(":id/consent/:channel/request")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER)
  @ApiOperation({
    summary: "Ask a driver to opt in",
    description:
      "Sends the opt-in request and marks consent pending. Pending is not consent — the driver's reply is what grants it, so sending stays blocked until they answer.",
  })
  @ApiOkResponse({ description: "Opt-in requested" })
  @ApiBadRequestResponse({ description: "Unknown channel, or the driver has no number on that channel" })
  async requestDriverConsent(
    @Param("id") id: string,
    @Param("channel") channel: string,
    @Req() req: FleetRequestContext,
  ) {
    const tenantId = this.tenantIdFromRequest(req);
    await this.assertDriverInScope(tenantId, req, id);
    const data = await this.driverMessagingUseCase.requestConsent(
      tenantId,
      id,
      this.parseConsentChannel(channel),
    );
    await this.recordActivity(req, {
      entityType: "driver",
      entityId: id,
      action: "driver.consent_requested",
      summary: `Opt-in requested on ${channel}`,
      metadata: { channel },
    });
    return { status: true, message: "Opt-in request sent", data };
  }

  @Patch(":id/consent/:channel")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR)
  @ApiOperation({
    summary: "Record a consent answer",
    description:
      "Records what the driver said, whether they replied on the channel or told an operator directly. Also used to honour an opt-out.",
  })
  @ApiOkResponse({ description: "Consent recorded" })
  async recordDriverConsent(
    @Param("id") id: string,
    @Param("channel") channel: string,
    @Body() payload: RecordDriverConsentDto,
    @Req() req: FleetRequestContext,
  ) {
    const tenantId = this.tenantIdFromRequest(req);
    await this.assertDriverInScope(tenantId, req, id);
    const data = await this.driverMessagingUseCase.recordResponse(
      tenantId,
      id,
      this.parseConsentChannel(channel),
      payload.state,
      payload.source ?? "operator",
    );
    await this.recordActivity(req, {
      entityType: "driver",
      entityId: id,
      action: `driver.consent_${payload.state}`,
      summary: `Driver ${payload.state === "opted_in" ? "opted in to" : "opted out of"} ${channel}`,
      metadata: { channel, source: payload.source ?? "operator" },
    });
    return { status: true, message: "Consent recorded", data };
  }

  @Post(":id/messages/:channel")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER)
  @ApiOperation({
    summary: "Message a driver",
    description:
      "Sends on WhatsApp or SMS through the configured provider. Refused with 409 when consent does not allow it, so the caller can prompt for an opt-in rather than silently failing.",
  })
  @ApiCreatedResponse({ description: "Message sent" })
  @ApiBadRequestResponse({ description: "Empty message, or no number on that channel" })
  async messageDriver(
    @Param("id") id: string,
    @Param("channel") channel: string,
    @Body() payload: SendDriverMessageDto,
    @Req() req: FleetRequestContext,
  ) {
    const tenantId = this.tenantIdFromRequest(req);
    await this.assertDriverInScope(tenantId, req, id);
    const parsedChannel = this.parseConsentChannel(channel);

    try {
      const data = await this.driverMessagingUseCase.sendMessage(tenantId, id, parsedChannel, payload.message);
      await this.recordActivity(req, {
        entityType: "driver",
        entityId: id,
        action: "driver.messaged",
        summary: `Message sent on ${parsedChannel}`,
        metadata: { channel: parsedChannel, reference: data.reference },
      });
      return { status: true, message: "Message sent", data };
    } catch (error) {
      if (error instanceof DriverConsentRequiredError) {
        throw new ConflictException({
          message: error.message,
          channel: error.channel,
          consentState: error.state,
        });
      }
      if (error instanceof DriverMessageDispatchError) {
        throw new ServiceUnavailableException(error.message);
      }
      throw error;
    }
  }

  private parseConsentChannel(raw: string): ConsentChannel {
    const channel = raw?.trim().toLowerCase();
    if (!(CONSENT_CHANNELS as readonly string[]).includes(channel)) {
      throw new BadRequestException(`Channel must be one of: ${CONSENT_CHANNELS.join(", ")}`);
    }
    return channel as ConsentChannel;
  }

  @Get("behavior/summary")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({
    summary: "Behaviour tab summary",
    description: "Average score, 24-hour event counts, zone entries and exits, and unread geofence alerts.",
  })
  @ApiQuery({ name: "period_days", required: false, type: Number })
  @ApiOkResponse({ description: "Behaviour summary" })
  async getBehaviorSummary(@Query("period_days") periodDays: string, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const data = await this.driverBehaviorUseCase.summary(
      tenantId,
      parseInt(periodDays ?? "30", 10),
      req.user?.userId ?? "system",
      await this.ownedDriverIds(tenantId, req),
      await this.ownedVehicleIds(tenantId, req),
    );
    return { status: true, message: "success", data };
  }

  @Get("behavior/ranking")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({
    summary: "Driver performance ranking",
    description: "Drivers ranked by behaviour score, with the four dimension scores and event counts.",
  })
  @ApiQuery({ name: "period_days", required: false, type: Number })
  @ApiOkResponse({ description: "Ranking" })
  async getBehaviorRanking(@Query("period_days") periodDays: string, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const data = await this.driverBehaviorUseCase.ranking(
      tenantId,
      parseInt(periodDays ?? "30", 10),
      await this.ownedDriverIds(tenantId, req),
    );
    return { status: true, message: "success", data };
  }

  @Get("behavior/events")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({
    summary: "Recent behaviour events",
    description: "Telemetry-derived events with speed and severity, plus the critical counter on the tab.",
  })
  @ApiQuery({ name: "period_days", required: false, type: Number })
  @ApiQuery({ name: "severity", required: false, enum: ["low", "medium", "high", "critical"] })
  @ApiQuery({ name: "driverId", required: false, type: String })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ description: "Events" })
  async getBehaviorEvents(
    @Query("period_days") periodDays: string,
    @Query("severity") severity: string,
    @Query("driverId") driverId: string,
    @Query("limit") limit: string,
    @Req() req: FleetRequestContext,
  ) {
    const tenantId = this.tenantIdFromRequest(req);
    const data = await this.driverBehaviorUseCase.listEvents(
      tenantId,
      {
        periodDays: parseInt(periodDays ?? "30", 10),
        severity: severity || undefined,
        driverId: driverId || undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      },
      await this.ownedDriverIds(tenantId, req),
    );
    return { status: true, message: "success", data };
  }

  @Post("behavior/events")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN)
  @ApiOperation({
    summary: "Record a behaviour event",
    description:
      "Ingest point for telemetry-derived events. The producer that classifies harsh driving from position deltas is not built yet (TD-3), so today this is written by integrations and tests.",
  })
  @ApiCreatedResponse({ description: "Event recorded" })
  @ApiBadRequestResponse({ description: "Unknown type or severity" })
  async recordBehaviorEvent(@Body() payload: RecordBehaviorEventDto, @Req() req: FleetRequestContext) {
    const data = await this.driverBehaviorUseCase.recordEvent(this.tenantIdFromRequest(req), payload);
    return { status: true, message: "Event recorded", data };
  }

  @Get("behavior/geofence-alerts")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({
    summary: "Geofence alert feed",
    description: "Zone entry, exit and dwell alerts with per-user read state.",
  })
  @ApiQuery({ name: "period_days", required: false, type: Number })
  @ApiOkResponse({ description: "Geofence alerts" })
  async getGeofenceAlerts(@Query("period_days") periodDays: string, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const data = await this.driverBehaviorUseCase.geofenceAlertFeed(
      tenantId,
      parseInt(periodDays ?? "7", 10),
      req.user?.userId ?? "system",
      await this.ownedVehicleIds(tenantId, req),
    );
    return { status: true, message: "success", data };
  }

  @Post("behavior/geofence-alerts/read")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({
    summary: "Mark geofence alerts read",
    description: "Read state is per person: clearing the panel does not clear it for colleagues.",
  })
  @ApiOkResponse({ description: "Marked read" })
  async markGeofenceAlertsRead(@Body() payload: MarkAlertsReadDto, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const data = await this.driverBehaviorUseCase.markGeofenceAlertsRead(
      tenantId,
      req.user?.userId ?? "system",
      payload.alertIds,
      await this.ownedVehicleIds(tenantId, req),
    );
    return { status: true, message: "success", data };
  }

  @Get("fatigue/summary")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({
    summary: "Fatigue AI summary",
    description:
      "Optional feature, off unless DRIVER_FATIGUE_ENABLED is set. Returns 503 when disabled so the tab can render its own empty state.",
  })
  @ApiOkResponse({ description: "Fatigue summary" })
  async getFatigueSummary(@Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const data = await this.driverFatigueUseCase.summary(
      tenantId,
      await this.ownedDriverIds(tenantId, req),
    );
    return { status: true, message: "success", data };
  }

  @Get(":id/fatigue")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Fatigue status and history for one driver" })
  @ApiOkResponse({ description: "Fatigue detail" })
  async getDriverFatigue(@Param("id") id: string, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    await this.assertDriverInScope(tenantId, req, id);
    const data = await this.driverFatigueUseCase.forDriver(tenantId, id);
    return { status: true, message: "success", data };
  }

  @Post(":id/fatigue/run")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({
    summary: "Run a fatigue analysis",
    description:
      "The Run Analysis button. Scores from recorded driving time and behaviour events only; dataQuality is always partial until driver-facing hardware exists.",
  })
  @ApiCreatedResponse({ description: "Analysis stored" })
  async runFatigueAnalysis(
    @Param("id") id: string,
    @Body() payload: RunFatigueAnalysisDto,
    @Req() req: FleetRequestContext,
  ) {
    const scopedTenantId = this.tenantIdFromRequest(req);
    await this.assertDriverInScope(scopedTenantId, req, id);
    const data = await this.driverFatigueUseCase.run(
      scopedTenantId,
      id,
      payload?.drivingMinutes,
      payload?.breakMinutes ?? null,
    );
    return { status: true, message: "Analysis complete", data };
  }

  @Get(":id/detail")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER)
  @ApiOperation({
    summary: "Driver detail",
    description:
      "Everything behind View Details: header counters, score breakdown with its inputs, contact and consent, licence state, safety overview and recent trips.",
  })
  @ApiOkResponse({ description: "Driver detail" })
  async getDriverDetail(@Param("id") id: string, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    await this.assertDriverInScope(tenantId, req, id);
    const data = await this.driverDetailUseCase.execute(tenantId, id);
    return { status: true, message: "success", data };
  }

  @Get(":id/behavior")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Behaviour scores and recent events for one driver" })
  @ApiQuery({ name: "period_days", required: false, type: Number })
  @ApiOkResponse({ description: "Driver behaviour" })
  async getDriverBehavior(
    @Param("id") id: string,
    @Query("period_days") periodDays: string,
    @Req() req: FleetRequestContext,
  ) {
    const tenantId = this.tenantIdFromRequest(req);
    await this.assertDriverInScope(tenantId, req, id);
    const data = await this.driverBehaviorUseCase.driverBehavior(
      tenantId,
      id,
      parseInt(periodDays ?? "30", 10),
    );
    return { status: true, message: "success", data };
  }

  /**
   * The drivers an owner operator may see: those assigned to one of their own
   * vehicles. Tenant is the outer boundary, this is the inner one, because an
   * owner operator can hold a seat inside an enterprise or aggregator tenant.
   * Returns null for every other role, meaning no scoping beyond tenant.
   */
  private async ownedDriverIds(
    tenantId: string,
    req: FleetRequestContext,
  ): Promise<Set<string> | null> {
    const ownerOperatorId = this.ownerOperatorIdFromRequest(req);
    if (!ownerOperatorId) return null;

    const [vehicles, drivers] = await Promise.all([
      this.vehicleRepository.findAllByOwnerOperatorId(ownerOperatorId, tenantId),
      this.listDriversUseCase.execute({ tenantId }),
    ]);
    return ownedDriverIdsFrom(
      vehicles.map((vehicle) => vehicle.id),
      (drivers as unknown as Array<Record<string, unknown>>).map((driver) => ({
        id: String(driver["id"]),
        assignedVehicleId: (driver["assignedVehicleId"] as string | null) ?? null,
      })),
    );
  }

  /** Alerts are keyed on the vehicle, so geofence scoping needs vehicle ids. */
  private async ownedVehicleIds(
    tenantId: string,
    req: FleetRequestContext,
  ): Promise<Set<string> | null> {
    return this.ownedVehicleIdsFor(this.vehicleRepository, tenantId, req);
  }

  /**
   * A driver outside the caller's scope is reported as missing rather than
   * forbidden: telling a caller that an id exists but is not theirs is what
   * makes ids worth guessing.
   */
  private async assertDriverInScope(
    tenantId: string,
    req: FleetRequestContext,
    driverId: string,
  ): Promise<void> {
    const owned = await this.ownedDriverIds(tenantId, req);
    if (owned && !owned.has(driverId)) {
      throw new NotFoundException("Driver not found");
    }
  }

  /** Retrieve a driver by ID */

  @Portals("tenant", "service")
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
