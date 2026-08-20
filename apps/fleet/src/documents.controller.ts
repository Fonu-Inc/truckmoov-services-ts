import {
  UploadedFile,
  UseInterceptors,
  Param,
  Inject,
  Get,
  BadRequestException,
  Req,
  Controller,
  UseGuards,
  Post,
  Query,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiQuery,
  ApiBody,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { EVENT_BUS, type EventBus } from "@shared/eventbus";
import { Roles, Role, RolesGuard } from "@shared/rbac";
import { AuditLogService } from "./audit-log.service";
import { BaseFleetController, FleetRequestContext } from "./base.controller";
import {
  GetDownloadUrlUseCase,
  ListAccessLogUseCase,
  ListDocumentsUseCase,
  UploadDocumentUseCase,
  EntityType,
  DocumentType,
} from "./contexts/fleet/documents";
import {
  DocumentResponse,
  DocumentListResponse,
  DownloadUrlResponse,
  AccessLogListResponse,
} from "./dto/fleet.schema";
import { TenantScoped } from "./tenant-scoped.decorator";

@ApiTags("Documents")
@Controller("documents")
@TenantScoped()
@UseGuards(RolesGuard)
export class DocumentsController extends BaseFleetController {
  constructor(
    protected readonly auditLog: AuditLogService,
    @Inject(EVENT_BUS) protected readonly bus: EventBus,
    @Inject(UploadDocumentUseCase) private readonly uploadDocumentUseCase: UploadDocumentUseCase,
    @Inject(GetDownloadUrlUseCase) private readonly getDownloadUrlUseCase: GetDownloadUrlUseCase,
    @Inject(ListDocumentsUseCase) private readonly listDocumentsUseCase: ListDocumentsUseCase,
    @Inject(ListAccessLogUseCase) private readonly listAccessLogUseCase: ListAccessLogUseCase,
  ) {
    super(auditLog, bus);
  }

  @Post()
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" } } } })
  @ApiOperation({ summary: "Upload document — J01" })
  @ApiQuery({ name: "entityType", required: true, enum: ["job", "vehicle", "driver"] })
  @ApiQuery({ name: "entityId", required: true, type: String })
  @ApiQuery({ name: "docType", required: true, enum: ["pod", "invoice", "permit", "other"] })
  @ApiQuery({ name: "uploadedBy", required: false, type: String, description: "Actor id credited with the upload; defaults to the authenticated user." })
  @ApiCreatedResponse({ type: DocumentResponse })
  async uploadDocument(
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    @Query("entityType") entityType: string,
    @Query("entityId") entityId: string,
    @Query("docType") docType: string,
    @Query("uploadedBy") uploadedBy = "system",
    @Req() req: FleetRequestContext,
  ): Promise<DocumentResponse> {
    const validEntityTypes: EntityType[] = ["job", "vehicle", "driver"];
    const validDocTypes: DocumentType[] = ["pod", "invoice", "permit", "other"];
    if (!validEntityTypes.includes(entityType as EntityType)) throw new BadRequestException("invalid entityType");
    if (!validDocTypes.includes(docType as DocumentType)) throw new BadRequestException("invalid docType");
    if (!file) throw new BadRequestException("file is required");

    const doc = await this.uploadDocumentUseCase.execute({
      tenantId: this.tenantIdFromRequest(req),
      entityType: entityType as EntityType,
      entityId,
      docType: docType as DocumentType,
      filename: file.originalname,
      contentType: file.mimetype,
      buffer: file.buffer,
      uploadedBy: uploadedBy === "system" ? req.user?.userId ?? "system" : uploadedBy,
    });
    await this.recordActivity(req, {
      entityType: "document",
      entityId: doc.id,
      action: "document.uploaded",
      summary: "Document uploaded",
      metadata: {
        entityType,
        entityId,
        docType,
        filename: file.originalname,
      },
    });

    return { status: true, message: "uploaded", data: { ...doc.toPrimitives(), uploadedAt: doc.uploadedAt.toISOString(), expiresAt: doc.expiresAt?.toISOString() ?? null } } as unknown as DocumentResponse;
  }

  @Get()
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "List documents for an entity — J01" })
  @ApiQuery({ name: "entityType", required: true, enum: ["job", "vehicle", "driver"] })
  @ApiQuery({ name: "entityId", required: true, type: String })
  @ApiOkResponse({ type: DocumentListResponse })
  async listDocuments(
    @Req() req: FleetRequestContext,
    @Query("entityType") entityType: string,
    @Query("entityId") entityId: string,
  ): Promise<DocumentListResponse> {
    const docs = await this.listDocumentsUseCase.execute(this.tenantIdFromRequest(req), entityType as EntityType, entityId);
    const data = docs.map((d) => ({ ...d.toPrimitives(), uploadedAt: d.uploadedAt.toISOString(), expiresAt: d.expiresAt?.toISOString() ?? null }));
    return { status: true, message: "success", data } as unknown as DocumentListResponse;
  }

  @Get(":id/download-url")
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.DISPATCHER, Role.OPERATIONS_MANAGER, "driver")
  @ApiOperation({ summary: "Get secure download URL — J02" })
  @ApiQuery({ name: "userId", required: false, type: String, description: "Actor id requesting the download; defaults to the authenticated user." })
  @ApiOkResponse({ type: DownloadUrlResponse })
  async getDocumentDownloadUrl(
    @Param("id") id: string,
    @Query("userId") userId = "system",
    @Req() req: FleetRequestContext,
  ): Promise<DownloadUrlResponse> {
    const result = await this.getDownloadUrlUseCase.execute(
      this.tenantIdFromRequest(req),
      id,
      userId == "system" ? req.user?.userId ?? "system" : userId,
      req.ip ?? "unknown",
    );
    return { status: true, message: "success", data: result } as unknown as DownloadUrlResponse;
  }

  @Get(":id/access-log")
  @Roles(Role.ENTERPRISE_ADMIN, Role.OPERATIONS_MANAGER)
  @ApiOperation({ summary: "Document access log — J04" })
  @ApiOkResponse({ type: AccessLogListResponse })
  async getDocumentAccessLog(
    @Param("id") docId: string,
    @Req() req: FleetRequestContext,
  ): Promise<AccessLogListResponse> {
    const entries = await this.listAccessLogUseCase.execute(this.tenantIdFromRequest(req), docId);
    const data = entries.map((e) => ({ ...e, at: e.at.toISOString() }));
    return { status: true, message: "success", data } as unknown as AccessLogListResponse;
  }
}
