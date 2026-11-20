import {
  HttpException,
  HttpStatus,
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
import { StorageQuotaExceededError } from "./storage-reporter.service";
import { MAX_DOCUMENT_UPLOAD_BYTES, uploadLimits } from "@shared/http";
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
  DocumentTooLargeError,
  DocumentTypeNotAllowedError,
  DocumentRejectedByScannerError,
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
import { Portals, OnResource } from "@shared/access";

@ApiTags("Documents")
@Portals("tenant")
@OnResource("tenant.documents")
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
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
  @UseInterceptors(FileInterceptor("file", uploadLimits(MAX_DOCUMENT_UPLOAD_BYTES)))
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" } } } })
  @ApiOperation({ summary: "Upload document — J01" })
  @ApiQuery({ name: "entityType", required: true, enum: ["job", "vehicle", "driver"] })
  @ApiQuery({ name: "entityId", required: true, type: String })
  @ApiQuery({ name: "docType", required: true, enum: ["pod", "invoice", "permit", "other"] })
  @ApiCreatedResponse({ type: DocumentResponse })
  async uploadDocument(
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    @Query("entityType") entityType: string,
    @Query("entityId") entityId: string,
    @Query("docType") docType: string,
    @Req() req: FleetRequestContext,
  ): Promise<DocumentResponse> {
    const validEntityTypes: EntityType[] = ["job", "vehicle", "driver"];
    const validDocTypes: DocumentType[] = ["pod", "invoice", "permit", "other"];
    if (!validEntityTypes.includes(entityType as EntityType)) throw new BadRequestException("invalid entityType");
    if (!validDocTypes.includes(docType as DocumentType)) throw new BadRequestException("invalid docType");
    if (!file) throw new BadRequestException("file is required");

    let doc;
    try {
      doc = await this.uploadDocumentUseCase.execute({
        tenantId: this.tenantIdFromRequest(req),
        entityType: entityType as EntityType,
        entityId,
        docType: docType as DocumentType,
        filename: file.originalname,
        contentType: file.mimetype,
        buffer: file.buffer,
        uploadedBy: req.user?.userId ?? "system",
      });
    } catch (error) {
      if (error instanceof StorageQuotaExceededError) {
        // 413 rather than 400: the request was well formed and the tenant is
        // simply out of room, which the caller has to tell apart from a bug.
        throw new HttpException(error.message, HttpStatus.PAYLOAD_TOO_LARGE);
      }
      if (
        error instanceof DocumentTooLargeError ||
        error instanceof DocumentTypeNotAllowedError ||
        error instanceof DocumentRejectedByScannerError
      ) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
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
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER, Role.OPERATIONS_MANAGER)
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
  @Roles(Role.ENTERPRISE_ADMIN, Role.FLEET_ADMIN, Role.OWNER_OPERATOR, Role.DISPATCHER, Role.OPERATIONS_MANAGER, "driver")
  @ApiOperation({ summary: "Get secure download URL — J02" })
  @ApiOkResponse({ type: DownloadUrlResponse })
  async getDocumentDownloadUrl(
    @Param("id") id: string,
    @Req() req: FleetRequestContext,
  ): Promise<DownloadUrlResponse> {
    const result = await this.getDownloadUrlUseCase.execute(
      this.tenantIdFromRequest(req),
      id,
      req.user?.userId ?? "system",
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
