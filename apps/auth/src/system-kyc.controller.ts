import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { ForbiddenError } from './contexts/auth/session';
import { KycReviewQueueResponse, KycReviewDocumentResponse } from './dto/auth.schema';
import { KycReviewQueueQueryDto, RejectKycDocumentDto } from './dto/review-kyc-document.dto';
import {
  ApproveKycDocumentUseCase,
  KycDocumentAlreadyReviewedError,
  KycDocumentNotFoundError,
  KycRejectionReasonRequiredError,
  ListKycReviewQueueUseCase,
  RejectKycDocumentUseCase,
} from './review-kyc-document.use-cases';
import { Portals } from '@shared/access';

@ApiTags('System KYC')
@Portals('admin')
@Controller('system/kyc')
export class SystemKycController extends BaseAuthController {
  constructor(
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
    @Inject(ListKycReviewQueueUseCase) private readonly listKycReviewQueueUseCase: ListKycReviewQueueUseCase,
    @Inject(ApproveKycDocumentUseCase) private readonly approveKycDocumentUseCase: ApproveKycDocumentUseCase,
    @Inject(RejectKycDocumentUseCase) private readonly rejectKycDocumentUseCase: RejectKycDocumentUseCase,
  ) {
    super(activityLogService);
  }

  @Get('documents')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List KYC documents awaiting review across tenants (system admin)' })
  @ApiOkResponse({ type: KycReviewQueueResponse })
  async listKycReviewQueue(
    @Query() query: KycReviewQueueQueryDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireAccessToken(authorization);
    try {
      return await this.listKycReviewQueueUseCase.execute(accessToken, query);
    } catch (error) {
      this.mapReviewError(error);
      throw error;
    }
  }

  @Patch('documents/:documentId/approve')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve a KYC document (system admin)' })
  @ApiOkResponse({ type: KycReviewDocumentResponse })
  async approveKycDocument(
    @Param('documentId') documentId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireAccessToken(authorization);
    try {
      const result = await this.approveKycDocumentUseCase.execute(accessToken, documentId);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.kyc.document.approved',
        entityType: 'tenant_kyc_document',
        entityId: documentId,
        summary: 'KYC document approved',
        metadata: {
          documentType: result.data.documentType,
          subjectTenantId: result.data.tenantId,
        },
      });
      return result;
    } catch (error) {
      this.mapReviewError(error);
      throw error;
    }
  }

  @Patch('documents/:documentId/reject')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject a KYC document with a mandatory reason (system admin)' })
  @ApiOkResponse({ type: KycReviewDocumentResponse })
  async rejectKycDocument(
    @Param('documentId') documentId: string,
    @Body() payload: RejectKycDocumentDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.requireAccessToken(authorization);
    try {
      const result = await this.rejectKycDocumentUseCase.execute(
        accessToken,
        documentId,
        payload.reason,
      );
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.kyc.document.rejected',
        entityType: 'tenant_kyc_document',
        entityId: documentId,
        summary: 'KYC document rejected',
        metadata: {
          documentType: result.data.documentType,
          subjectTenantId: result.data.tenantId,
          rejectionReason: result.data.rejectionReason,
        },
      });
      return result;
    } catch (error) {
      this.mapReviewError(error);
      throw error;
    }
  }

  private requireAccessToken(authorization?: string): string {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    return accessToken;
  }

  private mapReviewError(error: unknown): void {
    this.rethrowInvalidAccessToken(error);
    if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
    if (error instanceof KycDocumentNotFoundError) throw new NotFoundException(error.message);
    if (error instanceof KycDocumentAlreadyReviewedError) throw new ConflictException(error.message);
    if (error instanceof KycRejectionReasonRequiredError) throw new BadRequestException(error.message);
  }
}
