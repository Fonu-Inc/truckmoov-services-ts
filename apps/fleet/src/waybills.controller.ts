import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { uploadLimits } from "@shared/http";
import { Role, Roles, RolesGuard } from "@shared/rbac";
import { AuditLogService } from "./audit-log.service";
import { BaseFleetController, type FleetRequestContext } from "./base.controller";
import {
  CaptureWaybillUseCase,
  MAX_WAYBILL_IMAGE_BYTES,
} from "./contexts/fleet/waybills/application/use-cases/capture-waybill.use-case";
import {
  ListWaybillsUseCase,
  toWaybillRow,
} from "./contexts/fleet/waybills/application/use-cases/list-waybills.use-case";
import { WaybillNotFoundError } from "./contexts/fleet/waybills/domain/errors/waybill.errors";
import {
  WAYBILL_REPOSITORY,
  type WaybillRepository,
} from "./contexts/fleet/waybills/domain/repositories/waybill.repository";
import { WAYBILL_STATUSES } from "./contexts/fleet/waybills/domain/entities/waybill.entity";
import { ReviewWaybillUseCase } from "./contexts/fleet/waybills/application/use-cases/review-waybill.use-case";
import { ReviewWaybillDto } from "./dto/waybill.dto";
import { TenantScoped } from "./tenant-scoped.decorator";
import {
  DRIVER_REPOSITORY,
  type DriverRepository,
} from "./contexts/fleet/drivers/domain/repositories/driver.repository";
import { Portals, OnResource } from "@shared/access";
import { ListVehiclesUseCase } from "./contexts/fleet/vehicles";
import { isOnAllowedVehicle } from "./contexts/fleet/waybills/domain/vehicle-registration";

/** Reading revenue is a finance view; capturing a waybill is operations. */
const WAYBILL_READ_ROLES = [
  Role.ENTERPRISE_ADMIN,
  Role.FLEET_ADMIN,
  Role.OPERATIONS_MANAGER,
  Role.OWNER_OPERATOR,
  Role.FINANCE_VIEWER,
] as const;

const WAYBILL_WRITE_ROLES = [
  Role.ENTERPRISE_ADMIN,
  Role.FLEET_ADMIN,
  Role.OPERATIONS_MANAGER,
  Role.OWNER_OPERATOR,
  Role.DISPATCHER,
] as const;

/**
 * Waybill capture.
 *
 * The upload returns as soon as the image is stored and the row exists.
 * Extraction runs afterwards on a queue, so the screen sees the waybill
 * immediately as pending and watches it change rather than waiting on it.
 */
@ApiTags("Waybills")
@Portals("tenant")
@OnResource("tenant.waybills")
@Controller("waybills")
@TenantScoped()
@UseGuards(RolesGuard)
export class WaybillsController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(CaptureWaybillUseCase) private readonly capture: CaptureWaybillUseCase,
    @Inject(ListWaybillsUseCase) private readonly list: ListWaybillsUseCase,
    @Inject(WAYBILL_REPOSITORY) private readonly waybills: WaybillRepository,
    @Inject(ReviewWaybillUseCase) private readonly review: ReviewWaybillUseCase,
    @Inject(DRIVER_REPOSITORY) private readonly drivers: DriverRepository,
    @Inject(ListVehiclesUseCase) private readonly listVehiclesUseCase: ListVehiclesUseCase,
  ) {
    super(auditLog, bus);
  }

  @Get()
  @Roles(...WAYBILL_READ_ROLES)
  @ApiOperation({
    summary: "List waybills",
    description:
      "Paged. The summary figures count every waybill the caller can see and are not derived from the returned page. An independent owner operator sees only waybills on their own vehicles' registrations.",
  })
  @ApiQuery({ name: "query", required: false, type: String })
  @ApiQuery({ name: "status", required: false, enum: WAYBILL_STATUSES })
  @ApiQuery({ name: "customerName", required: false, type: String })
  @ApiQuery({ name: "dateFrom", required: false, type: String })
  @ApiQuery({ name: "dateTo", required: false, type: String })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiOkResponse()
  async listWaybills(
    @Req() req: FleetRequestContext,
    @Query("query") query?: string,
    @Query("status") status?: string,
    @Query("customerName") customerName?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    if (status && !WAYBILL_STATUSES.includes(status as never)) {
      throw new BadRequestException(`status must be one of: ${WAYBILL_STATUSES.join(", ")}`);
    }

    const tenantId = this.tenantIdFromRequest(req);
    const data = await this.list.execute({
      tenantId,
      registrationKeys: await this.ownedRegistrationKeysVia(this.listVehiclesUseCase, tenantId, req),
      query,
      status: status as never,
      customerName,
      dateFrom,
      dateTo,
      limit: toPositiveInt(limit),
      offset: toPositiveInt(offset),
    });

    return { status: true, message: "success", data };
  }

  @Portals("tenant", "service")
  @Post("upload")
  @Roles(...WAYBILL_WRITE_ROLES)
  @UseInterceptors(FileInterceptor("file", uploadLimits(MAX_WAYBILL_IMAGE_BYTES)))
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @ApiOperation({
    summary: "Upload a waybill photo",
    description:
      "JPG or PNG, 10 MB maximum. The image is hashed and stored, and the waybill appears immediately as pending while extraction runs.",
  })
  @ApiQuery({ name: "source", required: false, enum: ["upload", "whatsapp"] })
  @ApiCreatedResponse()
  async uploadWaybill(
    @Req() req: FleetRequestContext,
    @UploadedFile()
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    @Query("source") source?: string,
    @Body("driverId") driverId?: string,
    @Body("replyAddress") replyAddress?: string,
  ) {
    if (!file) throw new BadRequestException("a waybill image is required");

    const resolvedSource = source === "whatsapp" ? "whatsapp" : "upload";
    const tenantId = this.tenantIdFromRequest(req);
    const trimmedReplyAddress = replyAddress?.trim() || null;

    // A whatsapp capture rarely arrives with a driverId already known — the
    // sender is a phone number, not a signed-in user — so the number itself is
    // how the driver is found.
    let resolvedDriverId = driverId?.trim() || null;
    if (!resolvedDriverId && resolvedSource === "whatsapp" && trimmedReplyAddress) {
      const driver = await this.drivers.findByWhatsappNumber(trimmedReplyAddress, tenantId);
      resolvedDriverId = driver?.id ?? null;
    }

    const waybill = await this.runFleetUseCase(() =>
      this.capture.execute({
        tenantId,
        source: resolvedSource,
        buffer: file.buffer,
        contentType: file.mimetype,
        filename: file.originalname,
        driverId: resolvedDriverId,
        replyAddress: trimmedReplyAddress,
      }),
    );

    await this.recordActivity(req, {
      entityType: "waybill",
      entityId: waybill.id,
      action: "waybill_captured",
      summary: `Captured a waybill from ${waybill.source}`,
      metadata: { source: waybill.source, sha256: waybill.imageSha256 },
    });

    return { status: true, message: "success", data: toWaybillRow(waybill) };
  }

  @Get(":id")
  @Roles(...WAYBILL_READ_ROLES)
  @ApiOperation({ summary: "Get one waybill, with whatever extraction produced" })
  @ApiOkResponse()
  async getWaybill(@Param("id") id: string, @Req() req: FleetRequestContext) {
    const tenantId = this.tenantIdFromRequest(req);
    const allowed = await this.ownedRegistrationKeysVia(this.listVehiclesUseCase, tenantId, req);
    const waybill = await this.runFleetUseCase(async () => {
      const found = await this.waybills.findById(id, tenantId);
      // Another owner's waybill reads as missing, not as forbidden.
      if (!found || !isOnAllowedVehicle(found.vehicleRegistration, allowed)) throw new WaybillNotFoundError(id);
      return found;
    });

    return { status: true, message: "success", data: toWaybillRow(waybill) };
  }

  @Patch(":id/review")
  @Roles(...WAYBILL_WRITE_ROLES)
  @ApiOperation({
    summary: "Confirm or correct extracted fields",
    description:
      "Moves the waybill out of review. A person reading the page is the highest confidence available, so the corrected values are trusted outright.",
  })
  @ApiOkResponse()
  async reviewWaybill(
    @Param("id") id: string,
    @Body() body: ReviewWaybillDto,
    @Req() req: FleetRequestContext,
  ) {
    const tenantId = this.tenantIdFromRequest(req);
    const allowedRegistrationKeys = await this.ownedRegistrationKeysVia(this.listVehiclesUseCase, tenantId, req);
    const waybill = await this.runFleetUseCase(() =>
      this.review.execute({ ...body, waybillId: id, tenantId, allowedRegistrationKeys }),
    );

    await this.recordActivity(req, {
      entityType: "waybill",
      entityId: waybill.id,
      action: "waybill_reviewed",
      summary: `Reviewed waybill ${waybill.waybillNumber ?? waybill.id}`,
    });

    return { status: true, message: "success", data: toWaybillRow(waybill) };
  }
}

function toPositiveInt(value?: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}
