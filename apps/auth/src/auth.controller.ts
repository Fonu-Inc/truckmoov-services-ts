import {
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  Res,
  StreamableFile,
  Sse,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Observable } from 'rxjs';
import {
  ApiBody,
  ApiBadRequestResponse,
  ApiConsumes,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ObjectStorageService } from '@shared/object-storage';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  ChangeRoleUseCase,
  ChangeSystemPasswordUseCase,
  CreateSystemAdminUseCase,
  ForgotPasswordUseCase,
  GetHealthUseCase,
  GetMeUseCase,
  GetNotificationPreferencesUseCase,
  GetDispatcherPreferencesUseCase,
  GetOrganizationSettingsUseCase,
  GetProfileUseCase,
  ListSystemAdminsUseCase,
  InviteUserUseCase,
  InvalidSettingsError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  InvalidResetTokenError,
  InviteNotFoundError,
  LoginUseCase,
  LogoutUseCase,
  RefreshUseCase,
  RegisterInvitedUseCase,
  RegisterUseCase,
  RemoveOrganizationUserUseCase,
  ResendPendingInviteUseCase,
  ResetPasswordUseCase,
  ListOrganizationUsersUseCase,
  UpdateDispatcherPreferencesUseCase,
  UpdateNotificationPreferencesUseCase,
  UpdateOrganizationUserStatusUseCase,
  UpdateSystemAdminStatusUseCase,
  DeleteSystemAdminUseCase,
  UpdateOrganizationUserUseCase,
  UpdateOrganizationSettingsUseCase,
  UpdateProfileUseCase,
  EmailTakenError,
  UserNotFoundError,
  ValidateInviteUseCase,
  VerifyResetUseCase,
  ForbiddenError,
  InvalidVerificationTokenError,
  InvalidAccessTokenError,
  VerifyEmailUseCase,
  CompleteProfileUseCase,
} from './contexts/auth/session';
import { LoginDto } from './dto/login.dto';
import { ChangeSystemPasswordDto } from './dto/change-system-password.dto';
import { CreateSystemAdminDto } from './dto/create-system-admin.dto';
import { CreateSystemAdminInviteDto } from './dto/create-system-admin-invite.dto';
import { CreateSystemDeviceModelDto } from './dto/create-system-device-model.dto';
import { CreateSystemTenantDto } from './dto/create-system-tenant.dto';
import { UpdateSystemDeviceModelDto } from './dto/update-system-device-model.dto';
import { UpdateSystemFeatureFlagDto } from './dto/update-system-feature-flag.dto';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { UpdateSystemTenantDto } from './dto/update-system-tenant.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { ValidateInviteDto } from './dto/validate-invite.dto';
import { RegisterInvitedDto } from './dto/register-invited.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyResetDto } from './dto/verify-reset.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { LogoutDto } from './dto/logout.dto';
import {
  AuthResponse,
  SystemDashboardResponse,
  SystemTenantDetailResponse,
  SystemTenantOnboardingReferenceDataResponse,
  SystemSubscriptionPlansResponse,
  SystemTenantsListResponse,
  SystemTenantsSummaryResponse,
  SystemTenantDeleteResponse,
  DispatcherPreferencesResponse,
  HealthResponse,
  InviteActionResponse,
  MeResponse,
  NotificationPreferencesResponse,
  ActivityLogResponse,
  OrganizationUserResponse,
  OrganizationSettingsResponse,
  OrganizationUsersResponse,
  ProfileResponse,
  RemoveOrganizationUserResponse,
  SystemAdminInviteCancelResponse,
  SystemAdminInviteResponse,
  SystemAdminInvitesResponse,
  SystemDeviceCatalogDeleteResponse,
  SystemDeviceCatalogListResponse,
  SystemDeviceCatalogModelResponse,
  SystemDeviceCatalogReferenceDataResponse,
  SystemDeviceInventoryListResponse,
  SystemDeviceDetailResponse,
  SystemDeviceSummaryResponse,
  SystemFeatureFlagResponse,
  SystemFeatureFlagsResponse,
  SystemSettingsResponse,
  SystemTenantOnboardingResponse,
  SystemTenantInviteActionResponse,
  SystemSimSummaryResponse,
  SystemSimsListResponse,
  SystemSimDetailResponse,
  SystemSimRequestsListResponse,
  SystemSimRequestsSummaryResponse,
  SystemSimBatchesListResponse,
  SystemSimBatchesSummaryResponse,
  SystemSimBatchDetailResponse,
  SystemSupportDashboardResponse,
  SystemEscalatedTicketsResponse,
  SystemHealthResponse,
  SystemDeviceSetupRequestsResponse,
  SystemDeviceSetupRequestDetailResponse,
  UploadedMediaResponse,
  BusinessInfoResponse,
  KycDocumentsResponse,
  OnboardingStatusResponse,
} from './dto/auth.schema';
import { ResendInviteDto } from './dto/resend-invite.dto';
import { UpdateOrganizationUserDto } from './dto/update-organization-user.dto';
import { UpdateOrganizationUserStatusDto } from './dto/update-organization-user-status.dto';
import { UpdateSystemTenantStatusDto } from './dto/update-system-tenant-status.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { UpdateDispatcherPreferencesDto } from './dto/update-dispatcher-preferences.dto';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';
import { BodyOrDataPipe } from './body-or-data.pipe';
import { ActivityLogService } from './activity-log.service';
import { CreateSystemDeviceModelUseCase } from './create-system-device-model.use-case';
import {
  CreateSystemTenantUseCase,
  InvalidSubscriptionPlanError,
  TenantContactNameRequiredError,
} from './create-system-tenant.use-case';
import {
  CheckTenantSeatLimitUseCase,
  TenantSeatLimitReachedError,
} from './check-tenant-seat-limit.use-case';
import { DeleteSystemDeviceModelUseCase } from './delete-system-device-model.use-case';
import { ExportSystemTenantsUseCase } from './export-system-tenants.use-case';
import { ExportSystemDeviceInventoryUseCase } from './export-system-device-inventory.use-case';
import { GetActivityLogUseCase } from './get-activity-log.use-case';
import { GetSystemDeviceCatalogReferenceDataUseCase } from './get-system-device-catalog-reference-data.use-case';
import { GetSystemDeviceSummaryUseCase } from './get-system-device-summary.use-case';
import { GetSystemDashboardUseCase } from './get-system-dashboard.use-case';
import { GetSystemSubscriptionPlansUseCase } from './get-system-subscription-plans.use-case';
import { GetSystemActivityLogUseCase } from './get-system-activity-log.use-case';
import { GetSystemTenantsSummaryUseCase } from './get-system-tenants-summary.use-case';
import {
  GetSystemTenantUseCase,
  SystemTenantNotFoundError,
} from './get-system-tenant.use-case';
import { GetSystemTenantOnboardingReferenceDataUseCase } from './get-system-tenant-onboarding-reference-data.use-case';
import { GetSystemSettingsUseCase } from './get-system-settings.use-case';
import { ListSystemAdminInvitesUseCase } from './list-system-admin-invites.use-case';
import { ListSystemDeviceCatalogUseCase } from './list-system-device-catalog.use-case';
import { ListSystemDeviceInventoryUseCase } from './list-system-device-inventory.use-case';
import {
  GetSystemDeviceDetailUseCase,
  SystemDeviceNotFoundError,
} from './get-system-device-detail.use-case';
import { ListSystemFeatureFlagsUseCase } from './list-system-feature-flags.use-case';
import { ListSystemTenantsUseCase } from './list-system-tenants.use-case';
import {
  CreateSystemAdminInviteUseCase,
} from './create-system-admin-invite.use-case';
import { CancelSystemAdminInviteUseCase } from './cancel-system-admin-invite.use-case';
import { ResendSystemAdminInviteUseCase } from './resend-system-admin-invite.use-case';
import {
  ResendSystemTenantInviteUseCase,
  SystemTenantInviteResendConflictError,
} from './resend-system-tenant-invite.use-case';
import {
  InvalidSystemDeviceProvisioningError,
  SystemDeviceModelConflictError,
  SystemDeviceModelNotFoundError,
} from './system-device-model.errors';
import { UpdateSystemDeviceModelUseCase } from './update-system-device-model.use-case';
import {
  SystemFeatureFlagNotFoundError,
  UpdateSystemFeatureFlagUseCase,
} from './update-system-feature-flag.use-case';
import { UpdateSystemSettingsUseCase } from './update-system-settings.use-case';
import {
  SystemTenantStatusConflictError,
  UpdateSystemTenantStatusUseCase,
} from './update-system-tenant-status.use-case';
import {
  SystemTenantUpdateConflictError,
  UpdateSystemTenantUseCase,
} from './update-system-tenant.use-case';
import {
  DeleteSystemTenantUseCase,
  SystemTenantDeleteConflictError,
} from './delete-system-tenant.use-case';
import { GetSystemSimSummaryUseCase } from './get-system-sim-summary.use-case';
import { ListSystemSimsUseCase } from './list-system-sims.use-case';
import { ExportSystemSimsUseCase } from './export-system-sims.use-case';
import {
  GetSystemSimDetailUseCase,
  SimNotFoundError,
} from './get-system-sim-detail.use-case';
import { UpdateSystemSimUseCase } from './update-system-sim.use-case';
import { ReassignSystemSimUseCase } from './reassign-system-sim.use-case';
import { SuspendSystemSimUseCase } from './suspend-system-sim.use-case';
import { ListSystemSimRequestsUseCase } from './list-system-sim-requests.use-case';
import { ListSystemSimBatchesUseCase } from './list-system-sim-batches.use-case';
import { GetSystemSimRequestsSummaryUseCase } from './get-system-sim-requests-summary.use-case';
import { ExportSystemSimRequestsUseCase } from './export-system-sim-requests.use-case';
import {
  ApproveSystemSimRequestUseCase,
  SimRequestNotFoundError,
  SimRequestAlreadyProcessedError,
} from './approve-system-sim-request.use-case';
import { RejectSystemSimRequestUseCase } from './reject-system-sim-request.use-case';
import { GetSystemSimBatchesSummaryUseCase } from './get-system-sim-batches-summary.use-case';
import {
  GetSystemSimBatchDetailUseCase,
} from './get-system-sim-batch-detail.use-case';
import { ExportSystemSimBatchesUseCase } from './export-system-sim-batches.use-case';
import {
  RetrySystemSimBatchUseCase,
  SimBatchNotFoundError,
  SimBatchNotRetryableError,
} from './retry-system-sim-batch.use-case';
import {
  UpdateSystemSimDto,
  ReassignSystemSimDto,
  SuspendSystemSimDto,
  RejectSimRequestDto,
} from './dto/system-sim.dto';
import { GetSystemSupportDashboardUseCase } from './get-system-support-dashboard.use-case';
import { ListSystemSupportTicketsUseCase } from './list-system-support-tickets.use-case';
import { GetSystemSupportTicketUseCase } from './get-system-support-ticket.use-case';
import {
  UpdateSystemSupportTicketStatusUseCase,
  InvalidTicketStatusError,
} from './update-system-support-ticket-status.use-case';
import {
  EscalateSystemSupportTicketUseCase,
  InvalidEscalationTargetError,
} from './escalate-system-support-ticket.use-case';
import { ListSystemSupportTicketMessagesUseCase } from './list-system-support-ticket-messages.use-case';
import { SendSystemSupportMessageUseCase } from './send-system-support-message.use-case';
import { UpdateTicketStatusDto, EscalateTicketDto, SendSupportMessageDto, TICKET_CATEGORIES } from './dto/support.dto';
import { ExportSystemDeviceCatalogUseCase } from './export-system-device-catalog.use-case';
import { GetSystemHealthUseCase } from './get-system-health.use-case';
import { ExportSystemSupportTicketsUseCase } from './export-system-support-tickets.use-case';
import { ListSystemEscalatedTicketsUseCase } from './list-system-escalated-tickets.use-case';
import { ListSystemDeviceSetupRequestsUseCase } from './list-system-device-setup-requests.use-case';
import { ExportSystemDeviceSetupRequestsUseCase } from './export-system-device-setup-requests.use-case';
import {
  GetSystemDeviceSetupRequestUseCase,
  DeviceSetupRequestNotFoundError,
} from './get-system-device-setup-request.use-case';
import { AssignSystemDeviceSetupRequestUseCase } from './assign-system-device-setup-request.use-case';
import { RejectSystemDeviceSetupRequestUseCase } from './reject-system-device-setup-request.use-case';
import { RejectDeviceSetupRequestDto } from './dto/device-setup.dto';
import { AppConfigService } from '@shared/config';
import {
  CreatePaymentIntentDto,
  EnterpriseEnquiryDto,
  SaveBusinessInfoDto,
  SubmitDeviceProvisioningRequestDto,
  RegisterSimsDto,
  SubmitSimProvisioningRequestDto,
  SaveFeatureTogglesDto,
  KYC_DOCUMENT_TYPE_ENUM,
} from './dto/onboarding.dto';
import { GetOnboardingPlansUseCase } from './get-onboarding-plans.use-case';
import { GetExchangeRateUseCase } from './get-exchange-rate.use-case';
import {
  CreatePaymentIntentUseCase,
  PlanNotFoundError,
} from './create-payment-intent.use-case';
import { ActivateSubscriptionUseCase } from './activate-subscription.use-case';
import { SubscribePaymentEventsUseCase } from './subscribe-payment-events.use-case';
import { PaymentEventService } from './payment-event.service';
import { SubmitEnterpriseEnquiryUseCase } from './submit-enterprise-enquiry.use-case';
import { GetSubscriptionCapsUseCase } from './get-subscription-caps.use-case';
import { GetBusinessInfoUseCase } from './get-business-info.use-case';
import { SaveBusinessInfoUseCase } from './save-business-info.use-case';
import { ListKycDocumentsUseCase } from './list-kyc-documents.use-case';
import { GetOnboardingStatusUseCase } from './get-onboarding-status.use-case';
import { SaveKycDocumentUseCase } from './save-kyc-document.use-case';
import {
  DeleteKycDocumentUseCase,
  KycDocumentNotFoundError,
} from './delete-kyc-document.use-case';
import { SubmitDeviceProvisioningRequestUseCase } from './submit-device-provisioning-request.use-case';
import { RegisterSimsUseCase } from './register-sims.use-case';
import {
  ImportSimsCsvUseCase,
  InvalidCsvError,
} from './import-sims-csv.use-case';
import { SubmitSimProvisioningRequestUseCase } from './submit-sim-provisioning-request.use-case';
import {
  SaveFeatureTogglesUseCase,
  OnboardingNotFoundForFeaturesError,
} from './save-feature-toggles.use-case';
import { CompleteOnboardingUseCase } from './complete-onboarding.use-case';
import {
  ListTenantSimsUseCase,
  SimNotFoundError as TenantSimNotFoundError,
} from './list-tenant-sims.use-case';
import { GetTenantSimUseCase } from './get-tenant-sim.use-case';
import { RegisterTenantSimUseCase } from './register-tenant-sim.use-case';
import { UpdateTenantSimUseCase } from './update-tenant-sim.use-case';
import { SuspendTenantSimUseCase } from './suspend-tenant-sim.use-case';
import { ReactivateTenantSimUseCase } from './reactivate-tenant-sim.use-case';
import { UnassignDeviceFromSimUseCase } from './unassign-device-from-sim.use-case';
import { DeleteTenantSimUseCase } from './delete-tenant-sim.use-case';
import { ExportTenantSimsUseCase } from './export-tenant-sims.use-case';
import { GetSimImportTemplateUseCase } from './get-sim-import-template.use-case';
import { ImportTenantSimsCsvUseCase, CsvParseError } from './import-tenant-sims-csv.use-case';
import { ListTenantSimRequestsUseCase } from './list-tenant-sim-requests.use-case';
import { GetTenantSimRequestUseCase } from './get-tenant-sim-request.use-case';
import { SubmitTenantSimRequestUseCase } from './submit-tenant-sim-request.use-case';
import { GetDeviceMappingTemplateUseCase } from './get-device-mapping-template.use-case';
import { UploadDeviceMappingCsvUseCase } from './upload-device-mapping-csv.use-case';
import { ListCarriersUseCase } from './list-carriers.use-case';
import { CreateSystemCarrierUseCase } from './create-system-carrier.use-case';
import { UpdateSystemCarrierUseCase } from './update-system-carrier.use-case';
import { ListBundleCatalogUseCase } from './list-bundle-catalog.use-case';
import { CreateSystemBundleUseCase } from './create-system-bundle.use-case';
import { UpdateSystemBundleUseCase } from './update-system-bundle.use-case';
import { DeleteSystemBundleUseCase } from './delete-system-bundle.use-case';
import { GetBundleSummaryUseCase } from './get-bundle-summary.use-case';
import { GetWalletBalanceUseCase } from './get-wallet-balance.use-case';
import { TopupWalletUseCase } from './topup-wallet.use-case';
import { GetSpendingLimitUseCase } from './get-spending-limit.use-case';
import { SaveSpendingLimitUseCase } from './save-spending-limit.use-case';
import { DisableSpendingLimitUseCase } from './disable-spending-limit.use-case';
import { GetAutoTopupUseCase } from './get-auto-topup.use-case';
import { SaveAutoTopupUseCase } from './save-auto-topup.use-case';
import { DisableAutoTopupUseCase } from './disable-auto-topup.use-case';
import { ListBundleAllocationsUseCase } from './list-bundle-allocations.use-case';
import { GetBundleAllocationUseCase } from './get-bundle-allocation.use-case';
import { ExportBundleAllocationsUseCase } from './export-bundle-allocations.use-case';
import { AllocateBundleUseCase } from './allocate-bundle.use-case';
import { ListSimsForAllocationUseCase } from './list-sims-for-allocation.use-case';
import { ListBundleTransactionsUseCase } from './list-bundle-transactions.use-case';
import { ExportBundleTransactionsUseCase } from './export-bundle-transactions.use-case';
import { GetSpendTrendUseCase } from './get-spend-trend.use-case';
import { GetSpendBreakdownUseCase } from './get-spend-breakdown.use-case';
import { GetCarrierDistributionUseCase } from './get-carrier-distribution.use-case';
import { GetSubscriptionUsageUseCase } from './get-subscription-usage.use-case';
import { ListBundleRatesUseCase } from './list-bundle-rates.use-case';
import { ExportBundleRatesUseCase } from './export-bundle-rates.use-case';
import {
  RegisterTenantSimDto,
  UpdateTenantSimDto,
  SuspendSimDto,
  ListSimsQueryDto,
  SubmitSimRequestDto,
  CreateCarrierDto,
  UpdateCarrierDto,
  CreateBundleDto,
  UpdateBundleDto,
} from './dto/sim-management.dto';
import {
  TopUpWalletDto,
  SaveSpendingLimitDto,
  SaveAutoTopUpDto,
  AllocateBundleDto,
  ListAllocationsQueryDto,
  ListTransactionsQueryDto,
  AnalyticsRangeDto,
  ListBundleRatesQueryDto,
} from './dto/data-bundle.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    @Inject(LoginUseCase)
    private readonly loginUseCase: LoginUseCase,
    @Inject(ChangeSystemPasswordUseCase)
    private readonly changeSystemPasswordUseCase: ChangeSystemPasswordUseCase,
    @Inject(CreateSystemAdminUseCase)
    private readonly createSystemAdminUseCase: CreateSystemAdminUseCase,
    @Inject(CreateSystemAdminInviteUseCase)
    private readonly createSystemAdminInviteUseCase: CreateSystemAdminInviteUseCase,
    @Inject(CreateSystemTenantUseCase)
    private readonly createSystemTenantUseCase: CreateSystemTenantUseCase,
    @Inject(CreateSystemDeviceModelUseCase)
    private readonly createSystemDeviceModelUseCase: CreateSystemDeviceModelUseCase,
    @Inject(CancelSystemAdminInviteUseCase)
    private readonly cancelSystemAdminInviteUseCase: CancelSystemAdminInviteUseCase,
    @Inject(DeleteSystemDeviceModelUseCase)
    private readonly deleteSystemDeviceModelUseCase: DeleteSystemDeviceModelUseCase,
    @Inject(ExportSystemDeviceInventoryUseCase)
    private readonly exportSystemDeviceInventoryUseCase: ExportSystemDeviceInventoryUseCase,
    @Inject(ExportSystemTenantsUseCase)
    private readonly exportSystemTenantsUseCase: ExportSystemTenantsUseCase,
    @Inject(RefreshUseCase)
    private readonly refreshUseCase: RefreshUseCase,
    @Inject(GetMeUseCase)
    private readonly getMeUseCase: GetMeUseCase,
    @Inject(RegisterUseCase)
    private readonly registerUseCase: RegisterUseCase,
    @Inject(InviteUserUseCase)
    private readonly inviteUserUseCase: InviteUserUseCase,
    @Inject(CheckTenantSeatLimitUseCase)
    private readonly checkTenantSeatLimitUseCase: CheckTenantSeatLimitUseCase,
    @Inject(ValidateInviteUseCase)
    private readonly validateInviteUseCase: ValidateInviteUseCase,
    @Inject(RegisterInvitedUseCase)
    private readonly registerInvitedUseCase: RegisterInvitedUseCase,
    @Inject(ForgotPasswordUseCase)
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    @Inject(VerifyResetUseCase)
    private readonly verifyResetUseCase: VerifyResetUseCase,
    @Inject(GetHealthUseCase)
    private readonly getHealthUseCase: GetHealthUseCase,
    @Inject(ResetPasswordUseCase)
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    @Inject(ChangeRoleUseCase)
    private readonly changeRoleUseCase: ChangeRoleUseCase,
    @Inject(LogoutUseCase)
    private readonly logoutUseCase: LogoutUseCase,
    @Inject(GetProfileUseCase)
    private readonly getProfileUseCase: GetProfileUseCase,
    @Inject(ListSystemAdminsUseCase)
    private readonly listSystemAdminsUseCase: ListSystemAdminsUseCase,
    @Inject(ListOrganizationUsersUseCase)
    private readonly listOrganizationUsersUseCase: ListOrganizationUsersUseCase,
    @Inject(UpdateProfileUseCase)
    private readonly updateProfileUseCase: UpdateProfileUseCase,
    @Inject(UpdateOrganizationUserUseCase)
    private readonly updateOrganizationUserUseCase: UpdateOrganizationUserUseCase,
    @Inject(UpdateOrganizationUserStatusUseCase)
    private readonly updateOrganizationUserStatusUseCase: UpdateOrganizationUserStatusUseCase,
    @Inject(UpdateSystemAdminStatusUseCase)
    private readonly updateSystemAdminStatusUseCase: UpdateSystemAdminStatusUseCase,
    @Inject(DeleteSystemAdminUseCase)
    private readonly deleteSystemAdminUseCase: DeleteSystemAdminUseCase,
    @Inject(GetNotificationPreferencesUseCase)
    private readonly getNotificationPreferencesUseCase: GetNotificationPreferencesUseCase,
    @Inject(UpdateNotificationPreferencesUseCase)
    private readonly updateNotificationPreferencesUseCase: UpdateNotificationPreferencesUseCase,
    @Inject(GetDispatcherPreferencesUseCase)
    private readonly getDispatcherPreferencesUseCase: GetDispatcherPreferencesUseCase,
    @Inject(UpdateDispatcherPreferencesUseCase)
    private readonly updateDispatcherPreferencesUseCase: UpdateDispatcherPreferencesUseCase,
    @Inject(GetOrganizationSettingsUseCase)
    private readonly getOrganizationSettingsUseCase: GetOrganizationSettingsUseCase,
    @Inject(UpdateOrganizationSettingsUseCase)
    private readonly updateOrganizationSettingsUseCase: UpdateOrganizationSettingsUseCase,
    @Inject(GetActivityLogUseCase)
    private readonly getActivityLogUseCase: GetActivityLogUseCase,
    @Inject(GetSystemSettingsUseCase)
    private readonly getSystemSettingsUseCase: GetSystemSettingsUseCase,
    @Inject(GetSystemDeviceCatalogReferenceDataUseCase)
    private readonly getSystemDeviceCatalogReferenceDataUseCase: GetSystemDeviceCatalogReferenceDataUseCase,
    @Inject(GetSystemDeviceSummaryUseCase)
    private readonly getSystemDeviceSummaryUseCase: GetSystemDeviceSummaryUseCase,
    @Inject(GetSystemDashboardUseCase)
    private readonly getSystemDashboardUseCase: GetSystemDashboardUseCase,
    @Inject(GetSystemSubscriptionPlansUseCase)
    private readonly getSystemSubscriptionPlansUseCase: GetSystemSubscriptionPlansUseCase,
    @Inject(GetSystemActivityLogUseCase)
    private readonly getSystemActivityLogUseCase: GetSystemActivityLogUseCase,
    @Inject(GetSystemTenantsSummaryUseCase)
    private readonly getSystemTenantsSummaryUseCase: GetSystemTenantsSummaryUseCase,
    @Inject(GetSystemTenantUseCase)
    private readonly getSystemTenantUseCase: GetSystemTenantUseCase,
    @Inject(GetSystemTenantOnboardingReferenceDataUseCase)
    private readonly getSystemTenantOnboardingReferenceDataUseCase: GetSystemTenantOnboardingReferenceDataUseCase,
    @Inject(ListSystemAdminInvitesUseCase)
    private readonly listSystemAdminInvitesUseCase: ListSystemAdminInvitesUseCase,
    @Inject(ListSystemDeviceCatalogUseCase)
    private readonly listSystemDeviceCatalogUseCase: ListSystemDeviceCatalogUseCase,
    @Inject(ListSystemDeviceInventoryUseCase)
    private readonly listSystemDeviceInventoryUseCase: ListSystemDeviceInventoryUseCase,
    @Inject(GetSystemDeviceDetailUseCase)
    private readonly getSystemDeviceDetailUseCase: GetSystemDeviceDetailUseCase,
    @Inject(ListSystemFeatureFlagsUseCase)
    private readonly listSystemFeatureFlagsUseCase: ListSystemFeatureFlagsUseCase,
    @Inject(ListSystemTenantsUseCase)
    private readonly listSystemTenantsUseCase: ListSystemTenantsUseCase,
    @Inject(ResendSystemAdminInviteUseCase)
    private readonly resendSystemAdminInviteUseCase: ResendSystemAdminInviteUseCase,
    @Inject(ResendSystemTenantInviteUseCase)
    private readonly resendSystemTenantInviteUseCase: ResendSystemTenantInviteUseCase,
    @Inject(UpdateSystemDeviceModelUseCase)
    private readonly updateSystemDeviceModelUseCase: UpdateSystemDeviceModelUseCase,
    @Inject(UpdateSystemFeatureFlagUseCase)
    private readonly updateSystemFeatureFlagUseCase: UpdateSystemFeatureFlagUseCase,
    @Inject(UpdateSystemSettingsUseCase)
    private readonly updateSystemSettingsUseCase: UpdateSystemSettingsUseCase,
    @Inject(UpdateSystemTenantStatusUseCase)
    private readonly updateSystemTenantStatusUseCase: UpdateSystemTenantStatusUseCase,
    @Inject(UpdateSystemTenantUseCase)
    private readonly updateSystemTenantUseCase: UpdateSystemTenantUseCase,
    @Inject(DeleteSystemTenantUseCase)
    private readonly deleteSystemTenantUseCase: DeleteSystemTenantUseCase,
    @Inject(ResendPendingInviteUseCase)
    private readonly resendPendingInviteUseCase: ResendPendingInviteUseCase,
    @Inject(RemoveOrganizationUserUseCase)
    private readonly removeOrganizationUserUseCase: RemoveOrganizationUserUseCase,
    @Inject(VerifyEmailUseCase)
    private readonly verifyEmailUseCase: VerifyEmailUseCase,
    @Inject(CompleteProfileUseCase)
    private readonly completeProfileUseCase: CompleteProfileUseCase,
    @Inject(ActivityLogService)
    private readonly activityLogService: ActivityLogService,
    @Inject(ObjectStorageService)
    private readonly objectStorageService: ObjectStorageService,
    @Inject(GetSystemSimSummaryUseCase)
    private readonly getSystemSimSummaryUseCase: GetSystemSimSummaryUseCase,
    @Inject(ListSystemSimsUseCase)
    private readonly listSystemSimsUseCase: ListSystemSimsUseCase,
    @Inject(ExportSystemSimsUseCase)
    private readonly exportSystemSimsUseCase: ExportSystemSimsUseCase,
    @Inject(ListSystemSimRequestsUseCase)
    private readonly listSystemSimRequestsUseCase: ListSystemSimRequestsUseCase,
    @Inject(ListSystemSimBatchesUseCase)
    private readonly listSystemSimBatchesUseCase: ListSystemSimBatchesUseCase,
    @Inject(GetSystemSupportDashboardUseCase)
    private readonly getSystemSupportDashboardUseCase: GetSystemSupportDashboardUseCase,
    @Inject(ListSystemSupportTicketsUseCase)
    private readonly listSystemSupportTicketsUseCase: ListSystemSupportTicketsUseCase,
    @Inject(GetSystemSupportTicketUseCase)
    private readonly getSystemSupportTicketUseCase: GetSystemSupportTicketUseCase,
    @Inject(UpdateSystemSupportTicketStatusUseCase)
    private readonly updateSystemSupportTicketStatusUseCase: UpdateSystemSupportTicketStatusUseCase,
    @Inject(EscalateSystemSupportTicketUseCase)
    private readonly escalateSystemSupportTicketUseCase: EscalateSystemSupportTicketUseCase,
    @Inject(ListSystemSupportTicketMessagesUseCase)
    private readonly listSystemSupportTicketMessagesUseCase: ListSystemSupportTicketMessagesUseCase,
    @Inject(SendSystemSupportMessageUseCase)
    private readonly sendSystemSupportMessageUseCase: SendSystemSupportMessageUseCase,
    @Inject(ExportSystemDeviceCatalogUseCase)
    private readonly exportSystemDeviceCatalogUseCase: ExportSystemDeviceCatalogUseCase,
    @Inject(GetSystemHealthUseCase)
    private readonly getSystemHealthUseCase: GetSystemHealthUseCase,
    @Inject(ExportSystemSupportTicketsUseCase)
    private readonly exportSystemSupportTicketsUseCase: ExportSystemSupportTicketsUseCase,
    @Inject(ListSystemEscalatedTicketsUseCase)
    private readonly listSystemEscalatedTicketsUseCase: ListSystemEscalatedTicketsUseCase,
    @Inject(ListSystemDeviceSetupRequestsUseCase)
    private readonly listSystemDeviceSetupRequestsUseCase: ListSystemDeviceSetupRequestsUseCase,
    @Inject(ExportSystemDeviceSetupRequestsUseCase)
    private readonly exportSystemDeviceSetupRequestsUseCase: ExportSystemDeviceSetupRequestsUseCase,
    @Inject(GetSystemSimDetailUseCase)
    private readonly getSystemSimDetailUseCase: GetSystemSimDetailUseCase,
    @Inject(UpdateSystemSimUseCase)
    private readonly updateSystemSimUseCase: UpdateSystemSimUseCase,
    @Inject(ReassignSystemSimUseCase)
    private readonly reassignSystemSimUseCase: ReassignSystemSimUseCase,
    @Inject(SuspendSystemSimUseCase)
    private readonly suspendSystemSimUseCase: SuspendSystemSimUseCase,
    @Inject(GetSystemSimRequestsSummaryUseCase)
    private readonly getSystemSimRequestsSummaryUseCase: GetSystemSimRequestsSummaryUseCase,
    @Inject(ExportSystemSimRequestsUseCase)
    private readonly exportSystemSimRequestsUseCase: ExportSystemSimRequestsUseCase,
    @Inject(ApproveSystemSimRequestUseCase)
    private readonly approveSystemSimRequestUseCase: ApproveSystemSimRequestUseCase,
    @Inject(RejectSystemSimRequestUseCase)
    private readonly rejectSystemSimRequestUseCase: RejectSystemSimRequestUseCase,
    @Inject(GetSystemSimBatchesSummaryUseCase)
    private readonly getSystemSimBatchesSummaryUseCase: GetSystemSimBatchesSummaryUseCase,
    @Inject(GetSystemSimBatchDetailUseCase)
    private readonly getSystemSimBatchDetailUseCase: GetSystemSimBatchDetailUseCase,
    @Inject(ExportSystemSimBatchesUseCase)
    private readonly exportSystemSimBatchesUseCase: ExportSystemSimBatchesUseCase,
    @Inject(RetrySystemSimBatchUseCase)
    private readonly retrySystemSimBatchUseCase: RetrySystemSimBatchUseCase,
    @Inject(GetSystemDeviceSetupRequestUseCase)
    private readonly getSystemDeviceSetupRequestUseCase: GetSystemDeviceSetupRequestUseCase,
    @Inject(AssignSystemDeviceSetupRequestUseCase)
    private readonly assignSystemDeviceSetupRequestUseCase: AssignSystemDeviceSetupRequestUseCase,
    @Inject(RejectSystemDeviceSetupRequestUseCase)
    private readonly rejectSystemDeviceSetupRequestUseCase: RejectSystemDeviceSetupRequestUseCase,
    @Inject(AppConfigService)
    private readonly appConfig: AppConfigService,
    @Inject(GetOnboardingPlansUseCase)
    private readonly getOnboardingPlansUseCase: GetOnboardingPlansUseCase,
    @Inject(GetExchangeRateUseCase)
    private readonly getExchangeRateUseCase: GetExchangeRateUseCase,
    @Inject(CreatePaymentIntentUseCase)
    private readonly createPaymentIntentUseCase: CreatePaymentIntentUseCase,
    @Inject(ActivateSubscriptionUseCase)
    private readonly activateSubscriptionUseCase: ActivateSubscriptionUseCase,
    @Inject(SubscribePaymentEventsUseCase)
    private readonly subscribePaymentEventsUseCase: SubscribePaymentEventsUseCase,
    @Inject(PaymentEventService)
    private readonly paymentEventService: PaymentEventService,
    @Inject(SubmitEnterpriseEnquiryUseCase)
    private readonly submitEnterpriseEnquiryUseCase: SubmitEnterpriseEnquiryUseCase,
    @Inject(GetSubscriptionCapsUseCase)
    private readonly getSubscriptionCapsUseCase: GetSubscriptionCapsUseCase,
    @Inject(GetBusinessInfoUseCase)
    private readonly getBusinessInfoUseCase: GetBusinessInfoUseCase,
    @Inject(SaveBusinessInfoUseCase)
    private readonly saveBusinessInfoUseCase: SaveBusinessInfoUseCase,
    @Inject(ListKycDocumentsUseCase)
    private readonly listKycDocumentsUseCase: ListKycDocumentsUseCase,
    @Inject(GetOnboardingStatusUseCase)
    private readonly getOnboardingStatusUseCase: GetOnboardingStatusUseCase,
    @Inject(SaveKycDocumentUseCase)
    private readonly saveKycDocumentUseCase: SaveKycDocumentUseCase,
    @Inject(DeleteKycDocumentUseCase)
    private readonly deleteKycDocumentUseCase: DeleteKycDocumentUseCase,
    @Inject(SubmitDeviceProvisioningRequestUseCase)
    private readonly submitDeviceProvisioningRequestUseCase: SubmitDeviceProvisioningRequestUseCase,
    @Inject(RegisterSimsUseCase)
    private readonly registerSimsUseCase: RegisterSimsUseCase,
    @Inject(ImportSimsCsvUseCase)
    private readonly importSimsCsvUseCase: ImportSimsCsvUseCase,
    @Inject(SubmitSimProvisioningRequestUseCase)
    private readonly submitSimProvisioningRequestUseCase: SubmitSimProvisioningRequestUseCase,
    @Inject(SaveFeatureTogglesUseCase)
    private readonly saveFeatureTogglesUseCase: SaveFeatureTogglesUseCase,
    @Inject(CompleteOnboardingUseCase)
    private readonly completeOnboardingUseCase: CompleteOnboardingUseCase,
    @Inject(ListTenantSimsUseCase) private readonly listTenantSimsUseCase: ListTenantSimsUseCase,
    @Inject(GetTenantSimUseCase) private readonly getTenantSimUseCase: GetTenantSimUseCase,
    @Inject(RegisterTenantSimUseCase) private readonly registerTenantSimUseCase: RegisterTenantSimUseCase,
    @Inject(UpdateTenantSimUseCase) private readonly updateTenantSimUseCase: UpdateTenantSimUseCase,
    @Inject(SuspendTenantSimUseCase) private readonly suspendTenantSimUseCase: SuspendTenantSimUseCase,
    @Inject(ReactivateTenantSimUseCase) private readonly reactivateTenantSimUseCase: ReactivateTenantSimUseCase,
    @Inject(UnassignDeviceFromSimUseCase) private readonly unassignDeviceFromSimUseCase: UnassignDeviceFromSimUseCase,
    @Inject(DeleteTenantSimUseCase) private readonly deleteTenantSimUseCase: DeleteTenantSimUseCase,
    @Inject(ExportTenantSimsUseCase) private readonly exportTenantSimsUseCase: ExportTenantSimsUseCase,
    @Inject(GetSimImportTemplateUseCase) private readonly getSimImportTemplateUseCase: GetSimImportTemplateUseCase,
    @Inject(ImportTenantSimsCsvUseCase) private readonly importTenantSimsCsvUseCase: ImportTenantSimsCsvUseCase,
    @Inject(ListTenantSimRequestsUseCase) private readonly listTenantSimRequestsUseCase: ListTenantSimRequestsUseCase,
    @Inject(GetTenantSimRequestUseCase) private readonly getTenantSimRequestUseCase: GetTenantSimRequestUseCase,
    @Inject(SubmitTenantSimRequestUseCase) private readonly submitTenantSimRequestUseCase: SubmitTenantSimRequestUseCase,
    @Inject(GetDeviceMappingTemplateUseCase) private readonly getDeviceMappingTemplateUseCase: GetDeviceMappingTemplateUseCase,
    @Inject(UploadDeviceMappingCsvUseCase) private readonly uploadDeviceMappingCsvUseCase: UploadDeviceMappingCsvUseCase,
    @Inject(ListCarriersUseCase) private readonly listCarriersUseCase: ListCarriersUseCase,
    @Inject(CreateSystemCarrierUseCase) private readonly createSystemCarrierUseCase: CreateSystemCarrierUseCase,
    @Inject(UpdateSystemCarrierUseCase) private readonly updateSystemCarrierUseCase: UpdateSystemCarrierUseCase,
    @Inject(ListBundleCatalogUseCase) private readonly listBundleCatalogUseCase: ListBundleCatalogUseCase,
    @Inject(CreateSystemBundleUseCase) private readonly createSystemBundleUseCase: CreateSystemBundleUseCase,
    @Inject(UpdateSystemBundleUseCase) private readonly updateSystemBundleUseCase: UpdateSystemBundleUseCase,
    @Inject(DeleteSystemBundleUseCase) private readonly deleteSystemBundleUseCase: DeleteSystemBundleUseCase,
    @Inject(GetBundleSummaryUseCase) private readonly getBundleSummaryUseCase: GetBundleSummaryUseCase,
    @Inject(GetWalletBalanceUseCase) private readonly getWalletBalanceUseCase: GetWalletBalanceUseCase,
    @Inject(TopupWalletUseCase) private readonly topUpWalletUseCase: TopupWalletUseCase,
    @Inject(GetSpendingLimitUseCase) private readonly getSpendingLimitUseCase: GetSpendingLimitUseCase,
    @Inject(SaveSpendingLimitUseCase) private readonly saveSpendingLimitUseCase: SaveSpendingLimitUseCase,
    @Inject(DisableSpendingLimitUseCase) private readonly disableSpendingLimitUseCase: DisableSpendingLimitUseCase,
    @Inject(GetAutoTopupUseCase) private readonly getAutoTopUpUseCase: GetAutoTopupUseCase,
    @Inject(SaveAutoTopupUseCase) private readonly saveAutoTopUpUseCase: SaveAutoTopupUseCase,
    @Inject(DisableAutoTopupUseCase) private readonly disableAutoTopUpUseCase: DisableAutoTopupUseCase,
    @Inject(ListBundleAllocationsUseCase) private readonly listBundleAllocationsUseCase: ListBundleAllocationsUseCase,
    @Inject(GetBundleAllocationUseCase) private readonly getBundleAllocationUseCase: GetBundleAllocationUseCase,
    @Inject(ExportBundleAllocationsUseCase) private readonly exportBundleAllocationsUseCase: ExportBundleAllocationsUseCase,
    @Inject(AllocateBundleUseCase) private readonly allocateBundleUseCase: AllocateBundleUseCase,
    @Inject(ListSimsForAllocationUseCase) private readonly listSimsForAllocationUseCase: ListSimsForAllocationUseCase,
    @Inject(ListBundleTransactionsUseCase) private readonly listBundleTransactionsUseCase: ListBundleTransactionsUseCase,
    @Inject(ExportBundleTransactionsUseCase) private readonly exportBundleTransactionsUseCase: ExportBundleTransactionsUseCase,
    @Inject(GetSpendTrendUseCase) private readonly getSpendTrendUseCase: GetSpendTrendUseCase,
    @Inject(GetSpendBreakdownUseCase) private readonly getSpendBreakdownUseCase: GetSpendBreakdownUseCase,
    @Inject(GetCarrierDistributionUseCase) private readonly getCarrierDistributionUseCase: GetCarrierDistributionUseCase,
    @Inject(GetSubscriptionUsageUseCase) private readonly getSubscriptionUsageUseCase: GetSubscriptionUsageUseCase,
    @Inject(ListBundleRatesUseCase) private readonly listBundleRatesUseCase: ListBundleRatesUseCase,
    @Inject(ExportBundleRatesUseCase) private readonly exportBundleRatesUseCase: ExportBundleRatesUseCase,
  ) {}

  @Get('health')
  async health(): Promise<HealthResponse> {
    try {
      const data = await this.getHealthUseCase.execute();
      return {
        status: true,
        message: 'success',
        data,
      };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }

  @Get('system/health')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get system-wide service health status' })
  @ApiOkResponse({ type: SystemHealthResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async getSystemHealth(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemHealthUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('test-sentry')
  @ApiOperation({
    summary: 'Trigger a test Sentry error',
    description: 'Throws an unhandled error so Sentry capture can be verified.',
  })
  testSentry(): never {
    throw new Error('Sentry test error from auth service');
  }

  @Post('media/upload')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload media',
    description:
      'Uploads a media file to object storage and returns a link to it.',
  })
  @ApiCreatedResponse({ type: UploadedMediaResponse })
  @ApiBadRequestResponse({ description: 'Missing upload file' })
  @UseInterceptors(FileInterceptor('file'))
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadMedia(
    @UploadedFile()
    file?: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    return this.storeUploadedMedia('auth', file);
  }

  /** Register an enterprise admin (creates new tenant) */
  @Post('register')
  async register(
    @Body(BodyOrDataPipe) payload: RegisterDto,
  ): Promise<AuthResponse> {
    try {
      const result = await this.registerUseCase.execute(payload);
      await this.tryRecordActivity({
        tenantId: result.user.tenantId,
        service: 'auth',
        action: 'user.registered',
        entityType: 'user',
        entityId: result.user.id,
        summary: 'Enterprise admin account registered',
        actorId: result.user.id,
        actorRole: result.user.role,
        metadata: { email: result.user.email },
      });
      return result as unknown as AuthResponse;
    } catch (error) {
      if (error instanceof EmailTakenError)
        throw new ConflictException(error.message);
      throw error;
    }
  }

  /** Authenticate with email and password */
  @Post('login')
  async login(@Body(BodyOrDataPipe) payload: LoginDto): Promise<AuthResponse> {
    const result = await this.runAuthUseCase(() =>
      this.loginUseCase.execute(payload),
    );
    await this.tryRecordActivity({
      tenantId: result.user.tenantId,
      service: 'auth',
      action: 'user.logged_in',
      entityType: 'user',
      entityId: result.user.id,
      summary: 'User signed in',
      actorId: result.user.id,
      actorRole: result.user.role,
      metadata: { email: result.user.email },
    });
    return result as unknown as AuthResponse;
  }

  /** Authenticate a system account with email and password */
  @Post('system/login')
  async systemLogin(
    @Body(BodyOrDataPipe) payload: LoginDto,
  ): Promise<AuthResponse> {
    const result = await this.runAuthUseCase(() =>
      this.loginUseCase.executeForAudience(payload, 'system'),
    );
    await this.tryRecordActivity({
      tenantId: result.user.tenantId,
      service: 'auth',
      action:
        result.user.role === 'SUPER_ADMIN'
          ? 'superadmin.logged_in'
          : 'admin.logged_in',
      entityType: 'user',
      entityId: result.user.id,
      summary:
        result.user.role === 'SUPER_ADMIN'
          ? 'Super admin signed in'
          : 'System admin signed in',
      actorId: result.user.id,
      actorRole: result.user.role,
      metadata: { email: result.user.email },
    });
    return result as unknown as AuthResponse;
  }
  /** Exchange a refresh token for a new token pair */
  @Post('refresh')
  async refresh(
    @Body(BodyOrDataPipe) payload: RefreshDto,
  ): Promise<AuthResponse> {
    const result = await this.runAuthUseCase(() =>
      this.refreshUseCase.execute(payload.refreshToken),
    );
    await this.tryRecordActivityFromAccessToken(result.accessToken, {
      service: 'auth',
      action: 'user.session.refreshed',
      entityType: 'user',
      entityId: 'self',
      summary: 'User session refreshed',
    });
    return result as unknown as AuthResponse;
  }

  /** Change password for an authenticated system account */
  @Patch('system/change-password')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change system account password',
    description:
      'Allows a logged-in super admin or system admin to rotate their own password.',
  })
  @ApiOkResponse({ type: AuthResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not a system account' })
  async changeSystemPassword(
    @Body(BodyOrDataPipe) payload: ChangeSystemPasswordDto,
    @Headers('authorization') authorization?: string,
  ): Promise<AuthResponse> {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    const result = await this.runAuthUseCase(() =>
      this.changeSystemPasswordUseCase.execute({
        accessToken,
        currentPassword: payload.currentPassword,
        newPassword: payload.newPassword,
      }),
    );
    await this.tryRecordActivityFromAccessToken(accessToken, {
      service: 'auth',
      action:
        result.user.role === 'SUPER_ADMIN'
          ? 'superadmin.password.changed'
          : 'admin.password.changed',
      entityType: 'user',
      entityId: result.user.id,
      summary: 'System account password changed',
      metadata: { email: result.user.email },
    });
    return result as unknown as AuthResponse;
  }

  @Get('system/settings')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get system settings',
    description:
      'Returns global platform settings for the system admin surface.',
  })
  @ApiOkResponse({ type: SystemSettingsResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view system settings',
  })
  async getSystemSettings(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemSettingsUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch('system/settings')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update system settings',
    description:
      'Updates the global platform settings used by the system admin surface.',
  })
  @ApiOkResponse({ type: SystemSettingsResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to update system settings',
  })
  @ApiBadRequestResponse({ description: 'Invalid system settings payload' })
  async updateSystemSettings(
    @Body(BodyOrDataPipe) payload: UpdateSystemSettingsDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateSystemSettingsUseCase.execute({
        accessToken,
        platformName: payload.platformName,
        supportEmail: payload.supportEmail,
        defaults: payload.defaults,
        features: payload.features,
        retention: payload.retention,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.settings.updated',
        entityType: 'system_settings',
        entityId: 'system',
        summary: 'System settings updated',
        metadata: {
          updatedSections: {
            platformName: payload.platformName !== undefined,
            supportEmail: payload.supportEmail !== undefined,
            defaults: Boolean(payload.defaults),
            features: Boolean(payload.features),
            retention: Boolean(payload.retention),
          },
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof InvalidSettingsError)
        throw new BadRequestException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Decode the bearer token and return the authenticated user's claims */
  @Get('me')
  async me(
    @Headers('authorization') authorization?: string,
  ): Promise<MeResponse> {
    try {
      return (await this.getMeUseCase.execute(
        authorization,
      )) as unknown as Promise<MeResponse>;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) {
        throw new ForbiddenException(error.message);
      }
      if (error instanceof UserNotFoundError) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  /** Enterprise admin invites a user via email */
  @Post('invite')
  async inviteUser(
    @Body(BodyOrDataPipe) payload: InviteUserDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      await this.checkTenantSeatLimitUseCase.ensureSeatAvailable(accessToken);
      const result = await this.inviteUserUseCase.execute({
        email: payload.email,
        role: payload.role,
        accessToken,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'organization.invite.sent',
        entityType: 'invite',
        entityId: payload.email,
        summary: 'Organization invite sent',
        metadata: { email: payload.email, role: payload.role },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof TenantSeatLimitReachedError)
        throw new ConflictException(error.message);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      throw error;
    }
  }

  /** Super admin creates a system admin account */
  @Post('system/admins')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create system admin',
    description:
      'Allows the single super admin to create additional system admin accounts using the shared system admin endpoint surface.',
  })
  @ApiCreatedResponse({ type: OrganizationUserResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to create admin accounts',
  })
  @ApiConflictResponse({
    description: 'An account with this email already exists',
  })
  async createSystemAdmin(
    @Body(BodyOrDataPipe) payload: CreateSystemAdminDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.createSystemAdminUseCase.execute({
        accessToken,
        fullName: payload.fullName,
        email: payload.email,
        password: payload.password,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.admin.created',
        entityType: 'user',
        entityId: result.user.userId,
        summary: 'System admin account created',
        metadata: { email: result.user.email },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof InvalidSystemDeviceProvisioningError)
        throw new BadRequestException(error.message);
      if (error instanceof EmailTakenError)
        throw new ConflictException(error.message);
      throw error;
    }
  }

  /** System admin or super admin creates a tenant onboarding record and bootstrap invite */
  @Post('system/tenants')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create tenant onboarding',
    description:
      'Allows a super admin or system admin to create a tenant onboarding record and send the bootstrap admin invite.',
  })
  @ApiCreatedResponse({ type: SystemTenantOnboardingResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to create tenants',
  })
  @ApiConflictResponse({
    description: 'A pending invite or account already exists for this email',
  })
  async createSystemTenant(
    @Body(BodyOrDataPipe) payload: CreateSystemTenantDto,
    @Headers('authorization') authorization?: string,
  ): Promise<SystemTenantOnboardingResponse> {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.createSystemTenantUseCase.execute({
        accessToken,
        company: payload.company,
        subscription: payload.subscription,
        deviceProvisioning: payload.deviceProvisioning,
        simAssignment: payload.simAssignment,
        features: payload.features,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'tenant.onboarding.created',
        entityType: 'tenant',
        entityId: result.data.tenantId,
        summary: 'Tenant onboarding created',
        metadata: {
          onboardingId: result.data.onboardingId,
          adminInviteEmail: result.data.adminInviteEmail,
          bootstrapRole: result.data.bootstrapRole,
          planCode: result.data.subscription.planCode,
          organizationType: result.data.company.organizationType,
        },
      });
      return result as SystemTenantOnboardingResponse;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof InvalidSubscriptionPlanError)
        throw new BadRequestException(error.message);
      if (error instanceof TenantContactNameRequiredError)
        throw new BadRequestException(error.message);
      if (error instanceof EmailTakenError)
        throw new ConflictException(error.message);
      throw error;
    }
  }

  @Get('system/devices/summary')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get system device summary',
    description:
      'Returns platform-wide device inventory and device catalog summary metrics for system admins.',
  })
  @ApiOkResponse({ type: SystemDeviceSummaryResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view device summary data',
  })
  async getSystemDeviceSummary(
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemDeviceSummaryUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('system/devices')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List system device inventory',
    description:
      'Returns the platform-wide read-only device inventory for system admins.',
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'manufacturer', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: [
      'registered',
      'configured',
      'assigned',
      'active',
      'faulty',
      'decommissioned',
    ],
  })
  @ApiQuery({
    name: 'lifecycleStatus',
    required: false,
    enum: [
      'registered',
      'config_pending',
      'configured',
      'verified_online',
      'assignable',
      'assigned',
      'faulty',
      'decommissioned',
    ],
  })
  @ApiOkResponse({ type: SystemDeviceInventoryListResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view device inventory',
  })
  async listSystemDeviceInventory(
    @Headers('authorization') authorization?: string,
    @Query('search') search?: string,
    @Query('manufacturer') manufacturer?: string,
    @Query('status') status?: string,
    @Query('lifecycleStatus') lifecycleStatus?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.listSystemDeviceInventoryUseCase.execute(accessToken, {
        search,
        manufacturer,
        status,
        lifecycleStatus,
      });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('system/devices/export')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Export system device inventory',
    description:
      'Exports the platform-wide read-only device inventory as a CSV file.',
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'manufacturer', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: [
      'registered',
      'configured',
      'assigned',
      'active',
      'faulty',
      'decommissioned',
    ],
  })
  @ApiQuery({
    name: 'lifecycleStatus',
    required: false,
    enum: [
      'registered',
      'config_pending',
      'configured',
      'verified_online',
      'assignable',
      'assigned',
      'faulty',
      'decommissioned',
    ],
  })
  @ApiProduces('text/csv')
  @ApiOkResponse({
    description: 'CSV export of the system device inventory',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to export device inventory',
  })
  async exportSystemDeviceInventory(
    @Headers('authorization') authorization: string | undefined,
    @Query('search') search: string | undefined,
    @Query('manufacturer') manufacturer: string | undefined,
    @Query('status') status: string | undefined,
    @Query('lifecycleStatus') lifecycleStatus: string | undefined,
    @Res({ passthrough: true })
    response: { setHeader(name: string, value: string): void },
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const exported = await this.exportSystemDeviceInventoryUseCase.execute(
        accessToken,
        { search, manufacturer, status, lifecycleStatus },
      );
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${exported.filename}"`,
      );
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.devices.exported',
        entityType: 'device',
        entityId: 'system-device-inventory',
        summary: 'Exported system device inventory',
        metadata: {
          filters: {
            search: search ?? null,
            manufacturer: manufacturer ?? null,
            status: status ?? null,
            lifecycleStatus: lifecycleStatus ?? null,
          },
          exportedRowCount: exported.csv
            ? Math.max(exported.csv.split('\n').length - 1, 0)
            : 0,
        },
      });
      return new StreamableFile(Buffer.from(exported.csv, 'utf8'));
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('system/devices/catalog')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List system device catalog',
    description:
      'Returns the global device manufacturer/model catalog used by system admins and tenant onboarding.',
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['supported', 'deprecated', 'blocked'],
  })
  @ApiOkResponse({ type: SystemDeviceCatalogListResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view the device catalog',
  })
  async listSystemDeviceCatalog(
    @Headers('authorization') authorization?: string,
    @Query('search') search?: string,
    @Query('status') status?: 'supported' | 'deprecated' | 'blocked',
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.listSystemDeviceCatalogUseCase.execute(accessToken, {
        search,
        status,
      });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('system/devices/catalog/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export device catalog as CSV' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['supported', 'deprecated', 'blocked'] })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV export', schema: { type: 'string', format: 'binary' } })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async exportSystemDeviceCatalog(
    @Headers('authorization') authorization: string | undefined,
    @Query('search') search: string | undefined,
    @Query('status') status: 'supported' | 'deprecated' | 'blocked' | undefined,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const exported = await this.exportSystemDeviceCatalogUseCase.execute(accessToken, { search, status });
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
      return new StreamableFile(Buffer.from(exported.csv, 'utf8'));
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('system/devices/catalog')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create system device catalog model',
    description:
      'Creates a manufacturer/model entry in the global device catalog used by system admins and tenant onboarding.',
  })
  @ApiCreatedResponse({ type: SystemDeviceCatalogModelResponse })
  @ApiBadRequestResponse({ description: 'Invalid request payload' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to create device catalog models',
  })
  @ApiConflictResponse({
    description:
      'A device model with the same manufacturer and model already exists',
  })
  async createSystemDeviceModel(
    @Body(BodyOrDataPipe) payload: CreateSystemDeviceModelDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.createSystemDeviceModelUseCase.execute({
        accessToken,
        manufacturer: payload.manufacturer,
        model: payload.model,
        protocolType: payload.protocolType,
        defaultPort: payload.defaultPort,
        supportedFeatures: payload.supportedFeatures,
        status: payload.status,
        configurationInstructions: payload.configurationInstructions,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.device_model.created',
        entityType: 'device_model',
        entityId: result.data.id,
        summary: 'System device catalog model created',
        metadata: {
          manufacturer: result.data.manufacturer,
          model: result.data.model,
          status: result.data.status,
          protocolType: result.data.protocolType,
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof SystemDeviceModelConflictError)
        throw new ConflictException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch('system/devices/catalog/:deviceModelId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update system device catalog model',
    description:
      'Updates a manufacturer/model entry in the global device catalog.',
  })
  @ApiOkResponse({ type: SystemDeviceCatalogModelResponse })
  @ApiBadRequestResponse({ description: 'Invalid request payload' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to update device catalog models',
  })
  @ApiConflictResponse({
    description:
      'A device model with the same manufacturer and model already exists',
  })
  @ApiNotFoundResponse({ description: 'Device model not found' })
  async updateSystemDeviceModel(
    @Param('deviceModelId') deviceModelId: string,
    @Body(BodyOrDataPipe) payload: UpdateSystemDeviceModelDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateSystemDeviceModelUseCase.execute({
        accessToken,
        deviceModelId,
        manufacturer: payload.manufacturer,
        model: payload.model,
        protocolType: payload.protocolType,
        defaultPort: payload.defaultPort,
        supportedFeatures: payload.supportedFeatures,
        status: payload.status,
        configurationInstructions: payload.configurationInstructions,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.device_model.updated',
        entityType: 'device_model',
        entityId: result.data.id,
        summary: 'System device catalog model updated',
        metadata: {
          manufacturer: result.data.manufacturer,
          model: result.data.model,
          status: result.data.status,
          protocolType: result.data.protocolType,
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof SystemDeviceModelNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof SystemDeviceModelConflictError)
        throw new ConflictException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Delete('system/devices/catalog/:deviceModelId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete system device catalog model',
    description:
      'Deletes a manufacturer/model entry from the global device catalog.',
  })
  @ApiOkResponse({ type: SystemDeviceCatalogDeleteResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to delete device catalog models',
  })
  @ApiNotFoundResponse({ description: 'Device model not found' })
  async deleteSystemDeviceModel(
    @Param('deviceModelId') deviceModelId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.deleteSystemDeviceModelUseCase.execute(
        accessToken,
        deviceModelId,
      );
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.device_model.deleted',
        entityType: 'device_model',
        entityId: deviceModelId,
        summary: 'System device catalog model deleted',
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof SystemDeviceModelNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  // Declared AFTER every literal system/devices/* route so the :deviceId param
  // cannot swallow `summary`, `export`, or `catalog`.
  @Get('system/devices/:deviceId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get system device detail',
    description:
      'Returns the full detail record for a single device, including battery, firmware, and protocol.',
  })
  @ApiOkResponse({ type: SystemDeviceDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view device inventory',
  })
  @ApiNotFoundResponse({ description: 'Device not found' })
  async getSystemDeviceDetail(
    @Param('deviceId') deviceId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemDeviceDetailUseCase.execute(
        accessToken,
        deviceId,
      );
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof SystemDeviceNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('system/reference-data/device-catalog')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get system device catalog reference data',
    description:
      'Returns protocol types, catalog statuses, and supported feature options for the device catalog admin flow.',
  })
  @ApiOkResponse({ type: SystemDeviceCatalogReferenceDataResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description:
      'Caller is not permitted to view device catalog reference data',
  })
  async getSystemDeviceCatalogReferenceData(
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemDeviceCatalogReferenceDataUseCase.execute(
        accessToken,
      );
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Super admin lists all system admin accounts */
  @Get('system/admins')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List system admins',
    description:
      'Returns all system admin accounts through the shared system admin endpoint surface.',
  })
  @ApiOkResponse({ type: OrganizationUsersResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view admin accounts',
  })
  async listSystemAdmins(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.listSystemAdminsUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Super admin suspends or reactivates a system admin account */
  @Patch('system/admins/:userId/status')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update system admin account status',
    description:
      'Allows the super admin to suspend or reactivate another system admin account through the shared system admin endpoint surface.',
  })
  @ApiOkResponse({ type: OrganizationUserResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to change admin account status',
  })
  @ApiNotFoundResponse({ description: 'Admin account not found' })
  async updateSystemAdminStatus(
    @Param('userId') userId: string,
    @Body(BodyOrDataPipe) payload: UpdateOrganizationUserStatusDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateSystemAdminStatusUseCase.execute({
        accessToken,
        targetUserId: userId,
        accountStatus: payload.accountStatus,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action:
          payload.accountStatus === 'disabled'
            ? 'system.admin.disabled'
            : 'system.admin.reactivated',
        entityType: 'user',
        entityId: userId,
        summary:
          payload.accountStatus === 'disabled'
            ? 'System admin account suspended'
            : 'System admin account reactivated',
        metadata: {
          email: result.user.email,
          accountStatus: payload.accountStatus,
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Super admin permanently deletes a system admin account */
  @Delete('system/admins/:userId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete system admin',
    description:
      'Allows the super admin to permanently delete another system admin account through the shared system admin endpoint surface.',
  })
  @ApiOkResponse({ type: RemoveOrganizationUserResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to delete admin accounts',
  })
  @ApiNotFoundResponse({ description: 'Admin account not found' })
  async deleteSystemAdmin(
    @Param('userId') userId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.deleteSystemAdminUseCase.execute({
        accessToken,
        targetUserId: userId,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.admin.deleted',
        entityType: 'user',
        entityId: userId,
        summary: 'System admin account deleted',
        metadata: {
          email: result.email,
          deleted: true,
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('system/admin-invites')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List system admin invites',
    description:
      'Returns active pending system admin invites for the super admin surface.',
  })
  @ApiOkResponse({ type: SystemAdminInvitesResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view system admin invites',
  })
  async listSystemAdminInvites(
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.listSystemAdminInvitesUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Post('system/admin-invites')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create system admin invite',
    description:
      'Creates and sends a pending invite for a new system admin account.',
  })
  @ApiCreatedResponse({ type: SystemAdminInviteResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to invite system admins',
  })
  @ApiConflictResponse({
    description: 'An account or pending invite with this email already exists',
  })
  async createSystemAdminInvite(
    @Body(BodyOrDataPipe) payload: CreateSystemAdminInviteDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.createSystemAdminInviteUseCase.execute({
        accessToken,
        email: payload.email,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.admin.invited',
        entityType: 'invite',
        entityId: result.data.id,
        summary: 'System admin invitation sent',
        metadata: {
          email: result.data.email,
          role: result.data.role,
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof EmailTakenError)
        throw new ConflictException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Post('system/admin-invites/:inviteId/resend')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Resend system admin invite',
    description:
      'Resends a pending system admin invite and rotates the invite token.',
  })
  @ApiOkResponse({ type: SystemAdminInviteResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to resend system admin invites',
  })
  @ApiNotFoundResponse({ description: 'System admin invite not found' })
  async resendSystemAdminInvite(
    @Param('inviteId') inviteId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.resendSystemAdminInviteUseCase.execute({
        accessToken,
        inviteId,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.admin.invite.resent',
        entityType: 'invite',
        entityId: inviteId,
        summary: 'System admin invitation resent',
        metadata: {
          email: result.data.email,
          role: result.data.role,
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof InviteNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Delete('system/admin-invites/:inviteId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cancel system admin invite',
    description:
      'Cancels a pending system admin invite so the recipient can no longer join using that link.',
  })
  @ApiOkResponse({ type: SystemAdminInviteCancelResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to cancel system admin invites',
  })
  @ApiNotFoundResponse({ description: 'System admin invite not found' })
  async cancelSystemAdminInvite(
    @Param('inviteId') inviteId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.cancelSystemAdminInviteUseCase.execute(
        accessToken,
        inviteId,
      );
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.admin.invite.cancelled',
        entityType: 'invite',
        entityId: inviteId,
        summary: 'System admin invitation cancelled',
        metadata: {
          email: result.data.email,
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof InviteNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Resend a pending invite to a user who has not accepted yet */
  @Post('organization/invites/resend')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Resend pending invite',
    description:
      'Enterprise admin action: reissue an invite email for a still-pending tenant invite.',
  })
  @ApiCreatedResponse({ type: InviteActionResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'Pending invite not found' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to resend invites',
  })
  async resendInvite(
    @Body(BodyOrDataPipe) payload: ResendInviteDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.resendPendingInviteUseCase.execute({
        accessToken,
        email: payload.email,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'organization.invite.resent',
        entityType: 'invite',
        entityId: payload.email,
        summary: 'Pending organization invite resent',
        metadata: { email: payload.email },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof InviteNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Validate an invite token (called when user clicks the invite link) */
  @Get('invite/validate')
  async validateInvite(@Query() query: ValidateInviteDto) {
    try {
      return await this.validateInviteUseCase.execute(query.token);
    } catch (error) {
      if (error instanceof InviteNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Register from an invitation link */
  @Post('register/invited')
  async registerInvited(
    @Body(BodyOrDataPipe) payload: RegisterInvitedDto,
  ): Promise<AuthResponse> {
    try {
      const result = await this.registerInvitedUseCase.execute(payload);
      await this.tryRecordActivity({
        tenantId: result.user.tenantId,
        service: 'auth',
        action: 'user.registered_from_invite',
        entityType: 'user',
        entityId: result.user.id,
        summary: 'Invited user completed registration',
        actorId: result.user.id,
        actorRole: result.user.role,
        metadata: { email: result.user.email },
      });
      return result as unknown as AuthResponse;
    } catch (error) {
      if (error instanceof InviteNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof EmailTakenError)
        throw new ConflictException(error.message);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      throw error;
    }
  }

  /** Request a password reset via email or SMS */
  @Post('forgot-password')
  async forgotPassword(@Body(BodyOrDataPipe) payload: ForgotPasswordDto) {
    try {
      const result = await this.forgotPasswordUseCase.execute(payload);
      await this.tryRecordActivity({
        tenantId: result.tenantId,
        service: 'auth',
        action: 'user.password_reset.requested',
        entityType: 'user',
        entityId: result.userId,
        summary: 'Password reset requested',
        metadata: { email: result.email },
      });
      return { message: result.message };
    } catch (error) {
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Verify a password reset token */
  @Post('verify-reset')
  async verifyReset(@Body(BodyOrDataPipe) payload: VerifyResetDto) {
    try {
      return await this.verifyResetUseCase.execute({ token: payload.token });
    } catch (error) {
      if (error instanceof InvalidResetTokenError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  /** Verify new-user email token */
  @Post('verify-email')
  async verifyEmail(@Body(BodyOrDataPipe) payload: VerifyEmailDto) {
    try {
      const result = await this.verifyEmailUseCase.execute({
        token: payload.token,
      });
      await this.tryRecordActivity({
        tenantId: result.tenantId,
        service: 'auth',
        action: 'user.email.verified',
        entityType: 'user',
        entityId: result.userId,
        summary: 'User email verified',
        actorId: result.userId,
        actorRole: result.role,
        metadata: { email: result.email },
      });
      return { message: result.message };
    } catch (error) {
      if (error instanceof InvalidVerificationTokenError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  /** Complete invited-user profile (fullName + password) */
  @Post('complete-profile')
  async completeProfile(@Body(BodyOrDataPipe) payload: CompleteProfileDto) {
    try {
      const result = await this.completeProfileUseCase.execute(payload);
      await this.tryRecordActivity({
        tenantId: result.tenantId,
        service: 'auth',
        action: 'user.profile.completed',
        entityType: 'user',
        entityId: result.userId,
        summary: 'User completed profile setup',
        actorId: result.userId,
        actorRole: result.role,
        metadata: { email: result.email },
      });
      return { message: result.message };
    } catch (error) {
      if (error instanceof InvalidVerificationTokenError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  /** Reset password using a verified token */
  @Post('reset-password')
  async resetPassword(@Body(BodyOrDataPipe) payload: ResetPasswordDto) {
    try {
      const result = await this.resetPasswordUseCase.execute(payload);
      if (result.tenantId) {
        await this.tryRecordActivity({
          tenantId: result.tenantId,
          service: 'auth',
          action: 'user.password.reset',
          entityType: 'user',
          entityId: result.userId,
          summary: 'User password reset completed',
          actorId: result.userId,
          actorRole: result.role,
          metadata: { email: result.email },
        });
      }
      return { message: result.message };
    } catch (error) {
      if (error instanceof InvalidResetTokenError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  /** Change a user's role (enterprise admin only) */
  @Post('change-role')
  async changeRole(
    @Body(BodyOrDataPipe) payload: ChangeRoleDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.changeRoleUseCase.execute({
        targetUserId: payload.targetUserId,
        newRole: payload.newRole,
        accessToken,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'organization.user.role_changed',
        entityType: 'user',
        entityId: payload.targetUserId,
        summary: 'Organization user role changed',
        metadata: { newRole: payload.newRole },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Logout – invalidate the refresh token (and access token if possible) */
  @Post('logout')
  async logout(
    @Body(BodyOrDataPipe) payload: LogoutDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    const result = await this.logoutUseCase.execute({
      refreshToken: payload.refreshToken,
      accessToken: accessToken ?? undefined,
    });
    if (accessToken) {
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'user.logged_out',
        entityType: 'user',
        entityId: result.userId ?? 'self',
        summary: 'User signed out',
      });
    }
    return result;
  }

  /** Returns current authenticated user's editable profile details */
  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Epic B (US-B01): view authenticated user name/contact details.',
  })
  @ApiOkResponse({ type: ProfileResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted' })
  async getProfile(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getProfileUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Updates current authenticated user's name/contact details */
  @Patch('profile')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update current user profile',
    description:
      'Epic B (US-B01): edit authenticated user name/contact details.',
  })
  @ApiOkResponse({ type: ProfileResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted' })
  async updateProfile(
    @Body(BodyOrDataPipe) payload: UpdateProfileDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateProfileUseCase.execute({
        accessToken,
        fullName: payload.fullName,
        phoneNumber: payload.phoneNumber,
        address: payload.address,
        profilePictureUrl: payload.profilePictureUrl,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'profile.updated',
        entityType: 'user',
        entityId: 'self',
        summary: 'User profile updated',
        metadata: {
          fullName: payload.fullName,
          phoneNumber: payload.phoneNumber,
          address: payload.address,
          profilePictureUrl: payload.profilePictureUrl,
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Gets current notification preferences */
  @Get('preferences/notifications')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get notification preferences',
    description:
      'Epic B (US-B02): retrieve current notification preference settings.',
  })
  @ApiOkResponse({ type: NotificationPreferencesResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted' })
  async getNotificationPreferences(
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getNotificationPreferencesUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Updates current notification preferences */
  @Patch('preferences/notifications')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update notification preferences',
    description: 'Epic B (US-B02): update alert channel preferences.',
  })
  @ApiOkResponse({ type: NotificationPreferencesResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted' })
  async updateNotificationPreferences(
    @Body(BodyOrDataPipe) payload: UpdateNotificationPreferencesDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateNotificationPreferencesUseCase.execute({
        accessToken,
        smsAlerts: payload.smsAlerts,
        pushAlerts: payload.pushAlerts,
        incidentAlerts: payload.incidentAlerts,
        jobAssignment: payload.jobAssignment,
        jobCompletion: payload.jobCompletion,
        maintenanceReminders: payload.maintenanceReminders,
        fuelAlerts: payload.fuelAlerts,
        geofenceAlerts: payload.geofenceAlerts,
        emailDigest: payload.emailDigest,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'preferences.notifications.updated',
        entityType: 'user',
        entityId: result.userId,
        summary: 'Notification preferences updated',
        metadata: result.notificationPreferences,
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Gets dispatcher working-hours and timezone preferences */
  @Get('preferences/dispatch')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get dispatcher schedule and timezone preferences',
    description:
      'Epic B (US-B03): retrieve dispatcher working-hours/timezone settings.',
  })
  @ApiOkResponse({ type: DispatcherPreferencesResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Caller is not a dispatcher' })
  async getDispatcherPreferences(
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getDispatcherPreferencesUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Updates dispatcher working-hours and timezone preferences */
  @Patch('preferences/dispatch')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update dispatcher schedule and timezone preferences',
    description:
      'Epic B (US-B03): update dispatcher working-hours/timezone settings.',
  })
  @ApiOkResponse({ type: DispatcherPreferencesResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Caller is not a dispatcher' })
  @ApiBadRequestResponse({
    description: 'Invalid timezone/workday/shift format',
  })
  async updateDispatcherPreferences(
    @Body(BodyOrDataPipe) payload: UpdateDispatcherPreferencesDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateDispatcherPreferencesUseCase.execute({
        accessToken,
        timezone: payload.timezone,
        shiftStart: payload.shiftStart,
        shiftEnd: payload.shiftEnd,
        workDays: payload.workDays,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'preferences.dispatch.updated',
        entityType: 'user',
        entityId: result.userId,
        summary: 'Dispatcher preferences updated',
        metadata: {
          timezone: payload.timezone,
          shiftStart: payload.shiftStart,
          shiftEnd: payload.shiftEnd,
          workDays: payload.workDays,
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof InvalidSettingsError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  /** Lists users (accepted + invited) for the current tenant */
  @Get('organization/users')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List organization users',
    description: "Admin user management: fetch users and pending invitations for the caller's tenant.",
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'role', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, description: 'active | inactive | invited' })
  @ApiOkResponse({ type: OrganizationUsersResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to read users' })
  async listOrganizationUsers(
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.listOrganizationUsersUseCase.execute(accessToken, { search, role, status });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      throw error;
    }
  }

  /** Admin-only update of another tenant user's profile details */
  @Patch('organization/users/:userId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update organization user profile',
    description:
      "Admin user management: update another user's profile/contact details within the current tenant.",
  })
  @ApiOkResponse({ type: OrganizationUserResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to update users',
  })
  async updateOrganizationUser(
    @Param('userId') userId: string,
    @Body(BodyOrDataPipe) payload: UpdateOrganizationUserDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateOrganizationUserUseCase.execute({
        accessToken,
        targetUserId: userId,
        fullName: payload.fullName,
        phoneNumber: payload.phoneNumber,
        address: payload.address,
        profilePictureUrl: payload.profilePictureUrl,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'organization.user.updated',
        entityType: 'user',
        entityId: userId,
        summary: 'Organization user profile updated',
        metadata: {
          fullName: payload.fullName,
          phoneNumber: payload.phoneNumber,
          address: payload.address,
          profilePictureUrl: payload.profilePictureUrl,
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Enterprise-admin-only disabling or re-enabling of a tenant user */
  @Patch('organization/users/:userId/status')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update organization user account status',
    description:
      'Enterprise admin action: enable or disable a user account within the current tenant. Disabling revokes active sessions immediately.',
  })
  @ApiOkResponse({ type: OrganizationUserResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to change account status',
  })
  async updateOrganizationUserStatus(
    @Param('userId') userId: string,
    @Body(BodyOrDataPipe) payload: UpdateOrganizationUserStatusDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateOrganizationUserStatusUseCase.execute({
        accessToken,
        targetUserId: userId,
        accountStatus: payload.accountStatus,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'organization.user.account_status_changed',
        entityType: 'user',
        entityId: userId,
        summary: `Organization user account ${payload.accountStatus}`,
        metadata: { accountStatus: payload.accountStatus },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Admin-only removal of a tenant user */
  @Delete('organization/users/:userId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove organization user',
    description:
      'Admin user management: remove a user from the current tenant and revoke their sessions.',
  })
  @ApiOkResponse({ type: RemoveOrganizationUserResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to remove users',
  })
  async removeOrganizationUser(
    @Param('userId') userId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.removeOrganizationUserUseCase.execute({
        accessToken,
        targetUserId: userId,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'organization.user.removed',
        entityType: 'user',
        entityId: userId,
        summary: 'Organization user removed',
        metadata: { email: result.email },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Gets organization-level settings for the caller's tenant (read-only for authenticated tenant users). */
  @Get('organization/settings')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get organization settings',
    description:
      'Epic B (US-B04): retrieve tenant-level branding/default settings for the current tenant.',
  })
  @ApiOkResponse({ type: OrganizationSettingsResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  async getOrganizationSettings(
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getOrganizationSettingsUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('activity-log')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get tenant activity log',
    description:
      "Returns the persisted cross-service activity log for the caller's tenant.",
  })
  @ApiQuery({ name: 'service', required: false, type: String })
  @ApiQuery({ name: 'entityType', required: false, type: String })
  @ApiQuery({ name: 'entityId', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'actorId', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: ActivityLogResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view activity logs',
  })
  async getActivityLog(
    @Headers('authorization') authorization?: string,
    @Query('service') service?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
    @Query('limit') limit?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getActivityLogUseCase.execute(accessToken, {
        service,
        entityType,
        entityId,
        action,
        actorId,
        limit: limit ? parseInt(limit, 10) : undefined,
      });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('system/activity-log')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get system activity log',
    description:
      'Returns the persisted activity log for the system admin surface only.',
  })
  @ApiQuery({ name: 'service', required: false, type: String })
  @ApiQuery({ name: 'entityType', required: false, type: String })
  @ApiQuery({ name: 'entityId', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'actorId', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: ActivityLogResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view system activity logs',
  })
  async getSystemActivityLog(
    @Headers('authorization') authorization?: string,
    @Query('service') service?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
    @Query('limit') limit?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemActivityLogUseCase.execute(accessToken, {
        service,
        entityType,
        entityId,
        action,
        actorId,
        limit: limit ? parseInt(limit, 10) : undefined,
      });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('system/dashboard')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get system dashboard',
    description:
      'Returns system-wide dashboard metrics for super admin and system admin users.',
  })
  @ApiOkResponse({ type: SystemDashboardResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view the system dashboard',
  })
  async getSystemDashboard(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemDashboardUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('system/subscription-plans')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get system subscription plans',
    description:
      'Returns the hardcoded subscription plan catalog used by the system admin and super admin tenant onboarding flow.',
  })
  @ApiOkResponse({ type: SystemSubscriptionPlansResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view subscription plans',
  })
  async getSystemSubscriptionPlans(
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemSubscriptionPlansUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('system/feature-flags')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List system feature flags',
    description:
      'Returns platform-scoped feature flags for the system admin surface.',
  })
  @ApiOkResponse({ type: SystemFeatureFlagsResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view system feature flags',
  })
  async listSystemFeatureFlags(
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.listSystemFeatureFlagsUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch('system/feature-flags/:featureKey')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update system feature flag',
    description:
      'Updates a platform-scoped feature flag for the system admin surface.',
  })
  @ApiOkResponse({ type: SystemFeatureFlagResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to update system feature flags',
  })
  @ApiNotFoundResponse({ description: 'Feature flag not found' })
  async updateSystemFeatureFlag(
    @Param('featureKey') featureKey: string,
    @Body(BodyOrDataPipe) payload: UpdateSystemFeatureFlagDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateSystemFeatureFlagUseCase.execute({
        accessToken,
        featureKey,
        isEnabled: payload.isEnabled,
        rolloutPercentage: payload.rolloutPercentage,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.feature_flag.updated',
        entityType: 'feature_flag',
        entityId: featureKey,
        summary: 'System feature flag updated',
        metadata: {
          isEnabled: result.data.isEnabled,
          rolloutPercentage: result.data.rolloutPercentage,
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof SystemFeatureFlagNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('system/tenants/summary')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get system tenants summary',
    description:
      'Returns tenant management summary metrics for the super admin and system admin surface.',
  })
  @ApiOkResponse({ type: SystemTenantsSummaryResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view system tenants',
  })
  async getSystemTenantsSummary(
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemTenantsSummaryUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('system/tenants')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List system tenants',
    description:
      'Returns tenant management rows for the super admin and system admin surface.',
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'pending', 'suspended', 'inactive'],
  })
  @ApiQuery({
    name: 'plan',
    required: false,
    enum: ['starter', 'professional', 'enterprise'],
  })
  @ApiQuery({
    name: 'organizationType',
    required: false,
    enum: ['fleet_provider', 'enterprise', 'aggregator', 'owner_operator'],
  })
  @ApiQuery({
    name: 'kycStatus',
    required: false,
    enum: ['not_submitted', 'pending', 'under_review', 'verified', 'rejected'],
  })
  @ApiQuery({ name: 'revenueFrom', required: false, type: Number })
  @ApiQuery({ name: 'revenueTo', required: false, type: Number })
  @ApiQuery({ name: 'lastActiveFrom', required: false, type: String })
  @ApiQuery({ name: 'lastActiveTo', required: false, type: String })
  @ApiOkResponse({ type: SystemTenantsListResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view system tenants',
  })
  async listSystemTenants(
    @Headers('authorization') authorization?: string,
    @Query('search') search?: string,
    @Query('status') status?: 'active' | 'pending' | 'suspended' | 'inactive',
    @Query('plan') plan?: 'starter' | 'professional' | 'enterprise',
    @Query('organizationType')
    organizationType?:
      | 'fleet_provider'
      | 'enterprise'
      | 'aggregator'
      | 'owner_operator',
    @Query('kycStatus')
    kycStatus?:
      | 'not_submitted'
      | 'pending'
      | 'under_review'
      | 'verified'
      | 'rejected',
    @Query('revenueFrom') revenueFrom?: string,
    @Query('revenueTo') revenueTo?: string,
    @Query('lastActiveFrom') lastActiveFrom?: string,
    @Query('lastActiveTo') lastActiveTo?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.listSystemTenantsUseCase.execute(accessToken, {
        search,
        status,
        plan,
        organizationType,
        kycStatus,
        revenueFrom: this.parseNumericQuery(revenueFrom),
        revenueTo: this.parseNumericQuery(revenueTo),
        lastActiveFrom,
        lastActiveTo,
      });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('system/tenants/export')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Export system tenants',
    description:
      'Exports tenant management rows as a CSV file using the same filters as the tenant list endpoint.',
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'pending', 'suspended', 'inactive'],
  })
  @ApiQuery({
    name: 'plan',
    required: false,
    enum: ['starter', 'professional', 'enterprise'],
  })
  @ApiQuery({
    name: 'organizationType',
    required: false,
    enum: ['fleet_provider', 'enterprise', 'aggregator', 'owner_operator'],
  })
  @ApiQuery({
    name: 'kycStatus',
    required: false,
    enum: ['not_submitted', 'pending', 'under_review', 'verified', 'rejected'],
  })
  @ApiQuery({ name: 'revenueFrom', required: false, type: Number })
  @ApiQuery({ name: 'revenueTo', required: false, type: Number })
  @ApiQuery({ name: 'lastActiveFrom', required: false, type: String })
  @ApiQuery({ name: 'lastActiveTo', required: false, type: String })
  @ApiProduces('text/csv')
  @ApiOkResponse({
    description: 'CSV export of system tenants',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to export system tenants',
  })
  async exportSystemTenants(
    @Headers('authorization') authorization: string | undefined,
    @Query('search') search: string | undefined,
    @Query('status')
    status: 'active' | 'pending' | 'suspended' | 'inactive' | undefined,
    @Query('plan') plan: 'starter' | 'professional' | 'enterprise' | undefined,
    @Query('organizationType')
    organizationType:
      | 'fleet_provider'
      | 'enterprise'
      | 'aggregator'
      | 'owner_operator'
      | undefined,
    @Query('kycStatus')
    kycStatus:
      | 'not_submitted'
      | 'pending'
      | 'under_review'
      | 'verified'
      | 'rejected'
      | undefined,
    @Query('revenueFrom') revenueFrom: string | undefined,
    @Query('revenueTo') revenueTo: string | undefined,
    @Query('lastActiveFrom') lastActiveFrom: string | undefined,
    @Query('lastActiveTo') lastActiveTo: string | undefined,
    @Res({ passthrough: true })
    response: { setHeader(name: string, value: string): void },
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const exported = await this.exportSystemTenantsUseCase.execute(
        accessToken,
        {
          search,
          status,
          plan,
          organizationType,
          kycStatus,
          revenueFrom: this.parseNumericQuery(revenueFrom),
          revenueTo: this.parseNumericQuery(revenueTo),
          lastActiveFrom,
          lastActiveTo,
        },
      );
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader(
        'Content-Disposition',
        `attachment; filename="${exported.filename}"`,
      );
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.tenants.exported',
        entityType: 'tenant',
        entityId: 'system-tenants',
        summary: 'Exported system tenants',
        metadata: {
          filters: {
            search: search ?? null,
            status: status ?? null,
            plan: plan ?? null,
          },
          exportedRowCount: exported.csv
            ? Math.max(exported.csv.split('\n').length - 1, 0)
            : 0,
        },
      });
      return new StreamableFile(Buffer.from(exported.csv, 'utf8'));
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }
  @Get('system/reference-data/tenant-onboarding')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get tenant onboarding reference data',
    description:
      'Returns hardcoded onboarding reference data for the system admin and super admin flows.',
  })
  @ApiOkResponse({ type: SystemTenantOnboardingReferenceDataResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description:
      'Caller is not permitted to view tenant onboarding reference data',
  })
  async getSystemTenantOnboardingReferenceData(
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemTenantOnboardingReferenceDataUseCase.execute(
        accessToken,
      );
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('system/tenants/:tenantId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get system tenant detail',
    description:
      'Returns the detailed tenant management payload for a single tenant.',
  })
  @ApiOkResponse({ type: SystemTenantDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to view system tenants',
  })
  @ApiNotFoundResponse({ description: 'Tenant not found' })
  async getSystemTenant(
    @Param('tenantId') tenantId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      return await this.getSystemTenantUseCase.execute(accessToken, tenantId);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof SystemTenantNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch('system/tenants/:tenantId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update system tenant',
    description:
      'Allows a super admin or system admin to update tenant onboarding metadata and branding. For activated tenants, login identity fields remain immutable.',
  })
  @ApiOkResponse({ type: SystemTenantDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to update tenants',
  })
  @ApiNotFoundResponse({ description: 'Tenant not found' })
  @ApiConflictResponse({
    description:
      'Requested changes are incompatible with the tenant current activation state',
  })
  async updateSystemTenant(
    @Param('tenantId') tenantId: string,
    @Body(BodyOrDataPipe) payload: UpdateSystemTenantDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateSystemTenantUseCase.execute({
        accessToken,
        tenantId,
        company: payload.company,
        subscription: payload.subscription,
        deviceProvisioning: payload.deviceProvisioning,
        simAssignment: payload.simAssignment,
        features: payload.features,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.tenant.updated',
        entityType: 'tenant',
        entityId: tenantId,
        summary: 'Tenant updated',
        metadata: {
          updatedSections: {
            company: Boolean(payload.company),
            subscription: Boolean(payload.subscription),
            deviceProvisioning: Boolean(payload.deviceProvisioning),
            simAssignment: Boolean(payload.simAssignment),
            features: Boolean(payload.features),
          },
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof SystemTenantNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof InvalidSystemDeviceProvisioningError)
        throw new BadRequestException(error.message);
      if (
        error instanceof SystemTenantUpdateConflictError ||
        error instanceof EmailTakenError
      ) {
        throw new ConflictException(error.message);
      }
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Post('system/tenants/:tenantId/invite/resend')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Resend tenant onboarding invite',
    description:
      'Reissues the bootstrap invite for a tenant that is still pending activation.',
  })
  @ApiOkResponse({ type: SystemTenantInviteActionResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to resend tenant onboarding invites',
  })
  @ApiNotFoundResponse({ description: 'Tenant not found' })
  @ApiConflictResponse({
    description:
      'Tenant does not have a resendable onboarding invite in its current state',
  })
  async resendSystemTenantInvite(
    @Param('tenantId') tenantId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.resendSystemTenantInviteUseCase.execute({
        accessToken,
        tenantId,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'tenant.onboarding.invite.resent',
        entityType: 'tenant',
        entityId: tenantId,
        summary: 'Tenant onboarding invitation resent',
        metadata: {
          email: result.data.email,
          role: result.data.role,
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof SystemTenantNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof SystemTenantInviteResendConflictError)
        throw new ConflictException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch('system/tenants/:tenantId/status')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update system tenant status',
    description:
      'Allows a super admin or system admin to suspend or reactivate a tenant by updating all tenant user accounts.',
  })
  @ApiOkResponse({ type: SystemTenantDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to change tenant status',
  })
  @ApiNotFoundResponse({ description: 'Tenant not found' })
  @ApiConflictResponse({
    description:
      'Tenant status cannot be changed in its current onboarding state',
  })
  async updateSystemTenantStatus(
    @Param('tenantId') tenantId: string,
    @Body(BodyOrDataPipe) payload: UpdateSystemTenantStatusDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateSystemTenantStatusUseCase.execute({
        accessToken,
        tenantId,
        status: payload.status,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action:
          payload.status === 'active'
            ? 'system.tenant.reactivated'
            : 'system.tenant.suspended',
        entityType: 'tenant',
        entityId: tenantId,
        summary:
          payload.status === 'active'
            ? 'Tenant reactivated'
            : 'Tenant suspended',
        metadata: {
          requestedStatus: payload.status,
          resultingStatus: result.data.tenant.status,
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof SystemTenantNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof SystemTenantStatusConflictError)
        throw new ConflictException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Delete('system/tenants/:tenantId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete system tenant',
    description:
      'Deletes a tenant shell only when no tenant user accounts or operational fleet records exist.',
  })
  @ApiOkResponse({ type: SystemTenantDeleteResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({
    description: 'Caller is not permitted to delete tenants',
  })
  @ApiNotFoundResponse({ description: 'Tenant not found' })
  @ApiConflictResponse({
    description: 'Tenant cannot be deleted while it still owns platform data',
  })
  async deleteSystemTenant(
    @Param('tenantId') tenantId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.deleteSystemTenantUseCase.execute(
        accessToken,
        tenantId,
      );
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.tenant.deleted',
        entityType: 'tenant',
        entityId: tenantId,
        summary: 'Tenant deleted',
        metadata: {
          deleted: true,
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof SystemTenantNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof SystemTenantDeleteConflictError)
        throw new ConflictException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }
  }

  /* ── System SIM Management ─────────────────────────── */

  @Get('system/sims/summary')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get system SIM summary', description: 'Platform-wide SIM metrics.' })
  @ApiOkResponse({ type: SystemSimSummaryResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to view SIM summary' })
  async getSystemSimSummary(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemSimSummaryUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('system/sims')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List system SIM inventory', description: 'Platform-wide SIM inventory.' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'carrier', required: false, type: String })
  @ApiQuery({ name: 'tenantId', required: false, type: String })
  @ApiOkResponse({ type: SystemSimsListResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to view SIM inventory' })
  async listSystemSims(
    @Headers('authorization') authorization?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('carrier') carrier?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listSystemSimsUseCase.execute(accessToken, { search, status, carrier, tenantId });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('system/sims/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export system SIM inventory', description: 'CSV export of platform SIM inventory.' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'carrier', required: false, type: String })
  @ApiQuery({ name: 'tenantId', required: false, type: String })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV export', schema: { type: 'string', format: 'binary' } })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to export SIM inventory' })
  async exportSystemSims(
    @Headers('authorization') authorization: string | undefined,
    @Query('search') search: string | undefined,
    @Query('status') status: string | undefined,
    @Query('carrier') carrier: string | undefined,
    @Query('tenantId') tenantId: string | undefined,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const exported = await this.exportSystemSimsUseCase.execute(accessToken, { search, status, carrier, tenantId });
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.sims.exported',
        entityType: 'sim',
        entityId: 'system-sim-inventory',
        summary: 'Exported system SIM inventory',
      });
      return new StreamableFile(Buffer.from(exported.csv, 'utf8'));
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('system/sims/requests')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List SIM provisioning requests', description: 'Approval queue for tenant SIM requests.' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'approved', 'rejected'] })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'organisation', required: false, type: String, description: 'Tenant id or name' })
  @ApiQuery({ name: 'carrier', required: false, type: String, description: 'Preferred operator' })
  @ApiQuery({ name: 'useCase', required: false, type: String })
  @ApiOkResponse({ type: SystemSimRequestsListResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to view SIM requests' })
  async listSystemSimRequests(
    @Headers('authorization') authorization?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('organisation') organisation?: string,
    @Query('carrier') carrier?: string,
    @Query('useCase') useCase?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listSystemSimRequestsUseCase.execute(accessToken, {
        status,
        search,
        organisation,
        carrier,
        useCase,
      });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('system/sims/requests/summary')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'SIM approval queue summary', description: 'Counts for the SIM provisioning approval queue cards.' })
  @ApiOkResponse({ type: SystemSimRequestsSummaryResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to view SIM requests' })
  async getSystemSimRequestsSummary(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemSimRequestsSummaryUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('system/sims/requests/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export SIM provisioning requests', description: 'CSV export of the SIM approval queue.' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'approved', 'rejected'] })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'organisation', required: false, type: String })
  @ApiQuery({ name: 'carrier', required: false, type: String })
  @ApiQuery({ name: 'useCase', required: false, type: String })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV export', schema: { type: 'string', format: 'binary' } })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to export SIM requests' })
  async exportSystemSimRequests(
    @Headers('authorization') authorization: string | undefined,
    @Query('status') status: string | undefined,
    @Query('search') search: string | undefined,
    @Query('organisation') organisation: string | undefined,
    @Query('carrier') carrier: string | undefined,
    @Query('useCase') useCase: string | undefined,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const exported = await this.exportSystemSimRequestsUseCase.execute(accessToken, {
        status,
        search,
        organisation,
        carrier,
        useCase,
      });
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
      return new StreamableFile(Buffer.from(exported.csv, 'utf8'));
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('system/sims/requests/:requestId/approve')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve SIM provisioning request', description: 'Approves a pending request and queues an activation batch.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to approve SIM requests' })
  @ApiNotFoundResponse({ description: 'SIM request not found' })
  @ApiConflictResponse({ description: 'SIM request already processed' })
  async approveSystemSimRequest(
    @Param('requestId') requestId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.approveSystemSimRequestUseCase.execute(accessToken, requestId);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.sim_request.approved',
        entityType: 'sim_request',
        entityId: requestId,
        summary: 'SIM provisioning request approved',
        metadata: { batchId: result.data.batchId },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof SimRequestNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof SimRequestAlreadyProcessedError) throw new ConflictException(error.message);
      throw error;
    }
  }

  @Post('system/sims/requests/:requestId/reject')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject SIM provisioning request', description: 'Rejects a pending request with a reason.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to reject SIM requests' })
  @ApiNotFoundResponse({ description: 'SIM request not found' })
  @ApiConflictResponse({ description: 'SIM request already processed' })
  @ApiBadRequestResponse({ description: 'Missing rejection reason' })
  async rejectSystemSimRequest(
    @Param('requestId') requestId: string,
    @Body(BodyOrDataPipe) payload: RejectSimRequestDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.rejectSystemSimRequestUseCase.execute(accessToken, requestId, payload.reason);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.sim_request.rejected',
        entityType: 'sim_request',
        entityId: requestId,
        summary: 'SIM provisioning request rejected',
        metadata: { reason: payload.reason },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof SimRequestNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof SimRequestAlreadyProcessedError) throw new ConflictException(error.message);
      throw error;
    }
  }

  @Get('system/sims/batches')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List SIM activation batches', description: 'Monitor batch activation progress.' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'operator', required: false, type: String })
  @ApiQuery({ name: 'mode', required: false, enum: ['single', 'bulk'] })
  @ApiOkResponse({ type: SystemSimBatchesListResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to view SIM batches' })
  async listSystemSimBatches(
    @Headers('authorization') authorization?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('operator') operator?: string,
    @Query('mode') mode?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listSystemSimBatchesUseCase.execute(accessToken, { status, search, operator, mode });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('system/sims/batches/summary')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'SIM activation batches summary', description: 'Counts for the batch activation overview cards.' })
  @ApiOkResponse({ type: SystemSimBatchesSummaryResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to view SIM batches' })
  async getSystemSimBatchesSummary(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemSimBatchesSummaryUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('system/sims/batches/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export SIM activation batches', description: 'CSV export of activation batches.' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'operator', required: false, type: String })
  @ApiQuery({ name: 'mode', required: false, enum: ['single', 'bulk'] })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV export', schema: { type: 'string', format: 'binary' } })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to export SIM batches' })
  async exportSystemSimBatches(
    @Headers('authorization') authorization: string | undefined,
    @Query('status') status: string | undefined,
    @Query('search') search: string | undefined,
    @Query('operator') operator: string | undefined,
    @Query('mode') mode: string | undefined,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const exported = await this.exportSystemSimBatchesUseCase.execute(accessToken, { status, search, operator, mode });
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
      return new StreamableFile(Buffer.from(exported.csv, 'utf8'));
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('system/sims/batches/:batchId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get SIM activation batch detail' })
  @ApiOkResponse({ type: SystemSimBatchDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to view SIM batches' })
  @ApiNotFoundResponse({ description: 'SIM batch not found' })
  async getSystemSimBatchDetail(
    @Param('batchId') batchId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemSimBatchDetailUseCase.execute(accessToken, batchId);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof SimBatchNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Post('system/sims/batches/:batchId/retry')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retry SIM activation batch', description: 'Re-queues a failed or partially completed batch.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to retry SIM batches' })
  @ApiNotFoundResponse({ description: 'SIM batch not found' })
  @ApiConflictResponse({ description: 'SIM batch cannot be retried in its current state' })
  async retrySystemSimBatch(
    @Param('batchId') batchId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.retrySystemSimBatchUseCase.execute(accessToken, batchId);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.sim_batch.retried',
        entityType: 'sim_batch',
        entityId: batchId,
        summary: 'SIM activation batch queued for retry',
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof SimBatchNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof SimBatchNotRetryableError) throw new ConflictException(error.message);
      throw error;
    }
  }

  // Declared AFTER every literal system/sims/* route so :simId cannot swallow
  // `summary`, `export`, `requests`, or `batches`.
  @Get('system/sims/:simId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get SIM detail' })
  @ApiOkResponse({ type: SystemSimDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to view SIM inventory' })
  @ApiNotFoundResponse({ description: 'SIM not found' })
  async getSystemSimDetail(
    @Param('simId') simId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemSimDetailUseCase.execute(accessToken, simId);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof SimNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch('system/sims/:simId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update SIM', description: 'Edit plan, carrier, or data/SMS limits.' })
  @ApiOkResponse({ type: SystemSimDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to update SIMs' })
  @ApiNotFoundResponse({ description: 'SIM not found' })
  @ApiBadRequestResponse({ description: 'Invalid SIM update payload' })
  async updateSystemSim(
    @Param('simId') simId: string,
    @Body(BodyOrDataPipe) payload: UpdateSystemSimDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.updateSystemSimUseCase.execute(accessToken, simId, payload);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.sim.updated',
        entityType: 'sim',
        entityId: simId,
        summary: 'SIM updated',
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof SimNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch('system/sims/:simId/reassign')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reassign SIM', description: 'Assign the SIM to a tenant/device or return it to the pool.' })
  @ApiOkResponse({ type: SystemSimDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to reassign SIMs' })
  @ApiNotFoundResponse({ description: 'SIM not found' })
  async reassignSystemSim(
    @Param('simId') simId: string,
    @Body(BodyOrDataPipe) payload: ReassignSystemSimDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.reassignSystemSimUseCase.execute(accessToken, simId, {
        tenantId: payload.tenantId,
        deviceId: payload.deviceId,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.sim.reassigned',
        entityType: 'sim',
        entityId: simId,
        summary: 'SIM reassigned',
        metadata: { tenantId: payload.tenantId },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof SimNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch('system/sims/:simId/suspend')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Suspend or reactivate SIM' })
  @ApiOkResponse({ type: SystemSimDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to suspend SIMs' })
  @ApiNotFoundResponse({ description: 'SIM not found' })
  async suspendSystemSim(
    @Param('simId') simId: string,
    @Body(BodyOrDataPipe) payload: SuspendSystemSimDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.suspendSystemSimUseCase.execute(accessToken, simId, payload.suspend);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.sim.suspension_changed',
        entityType: 'sim',
        entityId: simId,
        summary: result.message,
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof SimNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  /** Updates organization-level settings for current tenant (enterprise admin only). */
  @Patch('organization/settings')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update organization settings',
    description:
      'Epic B (US-B04): update tenant-level branding/default settings.',
  })
  @ApiOkResponse({ type: OrganizationSettingsResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Caller is not an enterprise admin' })
  @ApiBadRequestResponse({ description: 'Invalid settings payload' })
  async updateOrganizationSettings(
    @Body(BodyOrDataPipe) payload: UpdateOrganizationSettingsDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');

    try {
      const result = await this.updateOrganizationSettingsUseCase.execute({
        accessToken,
        branding: payload.branding,
        defaults: payload.defaults,
      });
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'organization.settings.updated',
        entityType: 'organization',
        entityId: 'settings',
        summary: 'Organization settings updated',
        metadata: {
          branding: payload.branding,
          defaults: payload.defaults,
        },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError)
        throw new ForbiddenException(error.message);
      if (error instanceof UserNotFoundError)
        throw new NotFoundException(error.message);
      if (error instanceof InvalidSettingsError)
        throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Get('system/support/dashboard')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Support dashboard stats' })
  @ApiOkResponse({ type: SystemSupportDashboardResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async getSystemSupportDashboard(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemSupportDashboardUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('system/support/escalated')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List escalated tickets grouped by escalation party' })
  @ApiOkResponse({ type: SystemEscalatedTicketsResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async listSystemEscalatedTickets(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listSystemEscalatedTicketsUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('system/support/device-setup')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List device setup requests' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending_review', 'in_progress', 'assigned', 'rejected'] })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'manufacturer', required: false, type: String })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: 'ISO date lower bound on createdAt' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: 'ISO date upper bound on createdAt' })
  @ApiOkResponse({ type: SystemDeviceSetupRequestsResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async listSystemDeviceSetupRequests(
    @Headers('authorization') authorization: string | undefined,
    @Query('status') status: string | undefined,
    @Query('search') search: string | undefined,
    @Query('manufacturer') manufacturer: string | undefined,
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listSystemDeviceSetupRequestsUseCase.execute(accessToken, {
        status,
        search,
        manufacturer,
        dateFrom,
        dateTo,
      });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('system/support/device-setup/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export device setup requests as CSV' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending_review', 'in_progress', 'assigned', 'rejected'] })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'manufacturer', required: false, type: String })
  @ApiQuery({ name: 'dateFrom', required: false, type: String })
  @ApiQuery({ name: 'dateTo', required: false, type: String })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV export', schema: { type: 'string', format: 'binary' } })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async exportSystemDeviceSetupRequests(
    @Headers('authorization') authorization: string | undefined,
    @Query('status') status: string | undefined,
    @Query('search') search: string | undefined,
    @Query('manufacturer') manufacturer: string | undefined,
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const exported = await this.exportSystemDeviceSetupRequestsUseCase.execute(accessToken, {
        status,
        search,
        manufacturer,
        dateFrom,
        dateTo,
      });
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
      return new StreamableFile(Buffer.from(exported.csv, 'utf8'));
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  // Declared AFTER the literal device-setup/export route so :requestId cannot
  // swallow `export`.
  @Get('system/support/device-setup/:requestId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get device setup request detail' })
  @ApiOkResponse({ type: SystemDeviceSetupRequestDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  @ApiNotFoundResponse({ description: 'Device setup request not found' })
  async getSystemDeviceSetupRequest(
    @Param('requestId') requestId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemDeviceSetupRequestUseCase.execute(accessToken, requestId);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof DeviceSetupRequestNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch('system/support/device-setup/:requestId/assign')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assign device setup request to current actor' })
  @ApiOkResponse({ type: SystemDeviceSetupRequestDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to assign device setup requests' })
  @ApiNotFoundResponse({ description: 'Device setup request not found' })
  async assignSystemDeviceSetupRequest(
    @Param('requestId') requestId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.assignSystemDeviceSetupRequestUseCase.execute(accessToken, requestId);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.device_setup.assigned',
        entityType: 'device_setup_request',
        entityId: requestId,
        summary: 'Device setup request assigned',
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof DeviceSetupRequestNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch('system/support/device-setup/:requestId/reject')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject device setup request with a reason' })
  @ApiOkResponse({ type: SystemDeviceSetupRequestDetailResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Caller is not permitted to reject device setup requests' })
  @ApiNotFoundResponse({ description: 'Device setup request not found' })
  @ApiBadRequestResponse({ description: 'Missing rejection reason' })
  async rejectSystemDeviceSetupRequest(
    @Param('requestId') requestId: string,
    @Body(BodyOrDataPipe) payload: RejectDeviceSetupRequestDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.rejectSystemDeviceSetupRequestUseCase.execute(accessToken, requestId, payload.reason);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.device_setup.rejected',
        entityType: 'device_setup_request',
        entityId: requestId,
        summary: 'Device setup request rejected',
        metadata: { reason: payload.reason },
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof DeviceSetupRequestNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('system/support/tickets/summary')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get support ticket counts summary' })
  @ApiOkResponse({ type: SystemSupportDashboardResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async getSystemSupportTicketsSummary(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemSupportDashboardUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('system/support/tickets/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export support tickets as CSV' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, enum: TICKET_CATEGORIES })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'CSV export', schema: { type: 'string', format: 'binary' } })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async exportSystemSupportTickets(
    @Headers('authorization') authorization: string | undefined,
    @Query('status') status: string | undefined,
    @Query('category') category: string | undefined,
    @Query('search') search: string | undefined,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const exported = await this.exportSystemSupportTicketsUseCase.execute(accessToken, { status, category, search });
      response.setHeader('Content-Type', 'text/csv; charset=utf-8');
      response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
      return new StreamableFile(Buffer.from(exported.csv, 'utf8'));
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('system/support/tickets')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all support tickets' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, enum: TICKET_CATEGORIES })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  async listSystemSupportTickets(
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listSystemSupportTicketsUseCase.execute(accessToken, { status, category, search });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('system/support/tickets/:ticketId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get support ticket detail' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  @ApiNotFoundResponse({ description: 'Ticket not found' })
  async getSystemSupportTicket(
    @Param('ticketId') ticketId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSystemSupportTicketUseCase.execute(accessToken, ticketId);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof NotFoundException) throw error;
      throw error;
    }
  }

  @Patch('system/support/tickets/:ticketId/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update ticket status' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system mutator' })
  @ApiNotFoundResponse({ description: 'Ticket not found' })
  @ApiBadRequestResponse({ description: 'Invalid status' })
  async updateSystemSupportTicketStatus(
    @Param('ticketId') ticketId: string,
    @Body() body: UpdateTicketStatusDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.updateSystemSupportTicketStatusUseCase.execute(accessToken, ticketId, body.status);
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.support_ticket.status_updated',
        entityType: 'support_ticket',
        entityId: ticketId,
        summary: `Ticket status updated to ${body.status}`,
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof NotFoundException) throw error;
      if (error instanceof InvalidTicketStatusError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Patch('system/support/tickets/:ticketId/escalate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Escalate support ticket' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system mutator' })
  @ApiNotFoundResponse({ description: 'Ticket not found' })
  @ApiBadRequestResponse({ description: 'Invalid escalation target' })
  async escalateSystemSupportTicket(
    @Param('ticketId') ticketId: string,
    @Body() body: EscalateTicketDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.escalateSystemSupportTicketUseCase.execute(
        accessToken,
        ticketId,
        body.escalatedTo,
        body.referenceId,
        body.notes,
      );
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: 'system.support_ticket.escalated',
        entityType: 'support_ticket',
        entityId: ticketId,
        summary: `Ticket escalated to ${body.escalatedTo}`,
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof NotFoundException) throw error;
      if (error instanceof InvalidEscalationTargetError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Get('system/support/tickets/:ticketId/messages')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List ticket messages (includes internal notes)' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system actor' })
  @ApiNotFoundResponse({ description: 'Ticket not found' })
  async listSystemSupportTicketMessages(
    @Param('ticketId') ticketId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listSystemSupportTicketMessagesUseCase.execute(accessToken, ticketId);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof NotFoundException) throw error;
      throw error;
    }
  }

  @Post('system/support/tickets/:ticketId/messages')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send message or internal note on ticket' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiForbiddenResponse({ description: 'Not a system mutator' })
  @ApiNotFoundResponse({ description: 'Ticket not found' })
  async sendSystemSupportMessage(
    @Param('ticketId') ticketId: string,
    @Body() body: SendSupportMessageDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.sendSystemSupportMessageUseCase.execute(
        accessToken,
        ticketId,
        body.message,
        body.isInternal ?? false,
      );
      await this.tryRecordActivityFromAccessToken(accessToken, {
        service: 'auth',
        action: body.isInternal ? 'system.support_ticket.internal_note_added' : 'system.support_ticket.message_sent',
        entityType: 'support_ticket',
        entityId: ticketId,
        summary: body.isInternal ? 'Internal note added to ticket' : 'Message sent on ticket',
      });
      return result;
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof NotFoundException) throw error;
      throw error;
    }
  }

  private async runAuthUseCase<T>(fn: () => Promise<T>) {
    try {
      return await fn();
    } catch (error) {
      if (
        error instanceof InvalidCredentialsError ||
        error instanceof InvalidRefreshTokenError
      ) {
        throw new UnauthorizedException(error.message);
      }
      if (error instanceof ForbiddenError) {
        throw new ForbiddenException(error.message);
      }
      throw error;
    }
  }

  private rethrowInvalidAccessToken(error: unknown): void {
    if (error instanceof InvalidAccessTokenError) {
      throw new UnauthorizedException(error.message);
    }
  }

  private extractBearerToken(header?: string): string | null {
    if (!header) return null;
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    return token;
  }

  private parseNumericQuery(value?: string): number | undefined {
    if (value == null || value.trim() === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private async tryRecordActivity(
    command: Parameters<ActivityLogService['record']>[0],
  ): Promise<void> {
    try {
      await this.activityLogService.record(command);
    } catch (error) {
      this.logger.warn(
        `activity_log_record_failed:${command.action}:${(error as Error).message}`,
      );
    }
  }

  private async tryRecordActivityFromAccessToken(
    accessToken: string,
    command: Parameters<ActivityLogService['recordFromAccessToken']>[1],
  ): Promise<void> {
    try {
      await this.activityLogService.recordFromAccessToken(accessToken, command);
    } catch (error) {
      this.logger.warn(
        `activity_log_record_failed:${command.action}:${(error as Error).message}`,
      );
    }
  }

  /* ═══════════════════════════════════════════════════
     TENANT ONBOARDING FLOW
     ═══════════════════════════════════════════════════ */

  @Get('onboarding/plans')
  @ApiOperation({ summary: 'List subscription plans', description: 'Returns all active subscription plans with NGN prices and limits.' })
  @ApiOkResponse()
  async getOnboardingPlans() {
    return this.getOnboardingPlansUseCase.execute();
  }

  @Get('onboarding/exchange-rate')
  @ApiOperation({ summary: 'Current NGN/USD exchange rate', description: 'Live rate from ExchangeRate-API; cached 30 min.' })
  @ApiOkResponse()
  async getExchangeRate() {
    return this.getExchangeRateUseCase.execute();
  }

  @Post('onboarding/payment/intent')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create payment intent', description: 'Initialises a Paystack transaction (card) or MoMo USSD push. Returns authorization URL or USSD string.' })
  @ApiCreatedResponse()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiBadRequestResponse({ description: 'Plan not found or invalid gateway' })
  async createPaymentIntent(
    @Body(BodyOrDataPipe) payload: CreatePaymentIntentDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.createPaymentIntentUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof PlanNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Sse('onboarding/payment/events')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Subscribe to payment confirmation events (SSE)', description: 'Server-sent event stream. Emits once when the Paystack webhook confirms payment and activates the subscription.' })
  onboardingPaymentEvents(
    @Headers('authorization') authorization?: string,
  ): Observable<{ data: unknown }> {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    return this.subscribePaymentEventsUseCase.execute(accessToken);
  }

  @Post('onboarding/payment/webhook')
  @ApiOperation({ summary: 'Paystack payment webhook (no auth)', description: 'Receives charge.success events from Paystack. Validates HMAC signature, activates subscription, emits SSE to tenant.' })
  @ApiCreatedResponse()
  async paystackWebhook(
    @Req() req: RawBodyRequest<{ headers: Record<string, string | undefined> }>,
    @Body() body: Record<string, unknown>,
  ) {
    const secretKey = this.appConfig.payment.paystackSecretKey;
    if (!secretKey) throw new ServiceUnavailableException('Paystack not configured');
    const sig = req.headers['x-paystack-signature'] as string | undefined;
    if (!sig) throw new ForbiddenException('Missing signature');
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
    const payload = rawBody ?? Buffer.from(JSON.stringify(body));
    const hash = createHmac('sha512', secretKey).update(payload).digest('hex');
    const expected = Buffer.from(hash, 'hex');
    const provided = Buffer.from(sig, 'hex');
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      throw new ForbiddenException('Invalid webhook signature');
    }

    if (body['event'] === 'charge.success') {
      const data = body['data'] as Record<string, unknown> | undefined;
      const metadata = data?.['metadata'] as Record<string, unknown> | undefined;
      const tenantId = metadata?.['tenantId'] as string | undefined;
      const reference = data?.['reference'] as string | undefined;
      if (tenantId && reference) {
        try {
          await this.activateSubscriptionUseCase.execute(tenantId, reference);
          this.paymentEventService.emit(tenantId, { event: 'payment.confirmed', reference });
        } catch {
          this.logger.error(`Failed to activate subscription for tenant ${tenantId}`);
        }
      }
    }

    return { received: true };
  }

  @Post('onboarding/enterprise/enquiry')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit enterprise plan enquiry', description: 'Creates a support ticket of category enterprise_enquiry for the sales team.' })
  @ApiCreatedResponse()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async submitEnterpriseEnquiry(
    @Body(BodyOrDataPipe) payload: EnterpriseEnquiryDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.submitEnterpriseEnquiryUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('onboarding/subscription/caps')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get device & SIM caps for active plan', description: 'Returns maxDevices, maxSims, maxUsers from the tenant\'s active subscription plan.' })
  @ApiOkResponse()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async getSubscriptionCaps(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSubscriptionCapsUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('onboarding/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get onboarding status', description: 'Returns the onboarding completion status and active subscription info for the calling tenant.' })
  @ApiOkResponse({ type: OnboardingStatusResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async getOnboardingStatus(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getOnboardingStatusUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('onboarding/business-info')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get business info', description: 'Returns stored business registration details and verification status for the calling tenant.' })
  @ApiOkResponse({ type: BusinessInfoResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async getBusinessInfo(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getBusinessInfoUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Put('onboarding/business-info')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save/update business info', description: 'Upserts business registration details for the calling tenant. Verification status is managed by the system.' })
  @ApiOkResponse()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async saveBusinessInfo(
    @Body(BodyOrDataPipe) payload: SaveBusinessInfoDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.saveBusinessInfoUseCase.execute(accessToken, {
        companyName: payload.companyName,
        registrationNumber: payload.registrationNumber ?? null,
        taxId: payload.taxId ?? null,
        businessType: payload.businessType ?? null,
        industry: payload.industry ?? null,
        addressLine1: payload.addressLine1 ?? null,
        addressLine2: payload.addressLine2 ?? null,
        city: payload.city ?? null,
        state: payload.state ?? null,
        postalCode: payload.postalCode ?? null,
        country: payload.country ?? null,
        phone: payload.phone ?? null,
        email: payload.email ?? null,
        billingEmail: payload.billingEmail ?? null,
        website: payload.website ?? null,
        yearEstablished: payload.yearEstablished ?? null,
        numberOfEmployees: payload.numberOfEmployees ?? null,
      });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('onboarding/kyc/documents')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List KYC documents', description: 'Lists all uploaded KYC documents for the calling tenant with their id, type, name, size, and status.' })
  @ApiOkResponse({ type: KycDocumentsResponse })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async listKycDocuments(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listKycDocumentsUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('onboarding/kyc/documents')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload KYC document', description: 'Uploads a KYC document file (stored privately in Wasabi) and records the document metadata.' })
  @ApiCreatedResponse()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiBadRequestResponse({ description: 'Missing file or invalid document_type' })
  @UseInterceptors(FileInterceptor('file'))
  @ApiBody({
    schema: {
      type: 'object',
      required: ['document_type', 'file'],
      properties: {
        document_type: { type: 'string', enum: [...KYC_DOCUMENT_TYPE_ENUM] },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async uploadKycDocument(
    @UploadedFile() file?: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    @Body('document_type') documentType?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    if (!file?.buffer?.length) throw new BadRequestException('Missing upload file');
    if (!documentType || !KYC_DOCUMENT_TYPE_ENUM.includes(documentType as typeof KYC_DOCUMENT_TYPE_ENUM[number])) {
      throw new BadRequestException('Invalid or missing document_type');
    }

    const ext = extname(file.originalname).toLowerCase();
    const key = `auth/kyc/${randomUUID()}${ext}`;
    try {
      await this.objectStorageService.putObject({
        key,
        body: file.buffer,
        contentType: file.mimetype,
        visibility: 'private',
      });
    } catch {
      throw new ServiceUnavailableException('File upload failed');
    }

    try {
      return await this.saveKycDocumentUseCase.execute(accessToken, {
        documentType: documentType as typeof KYC_DOCUMENT_TYPE_ENUM[number],
        documentName: file.originalname,
        fileKey: key,
        fileSize: file.size,
      });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Delete('onboarding/kyc/documents/:docId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete KYC document', description: 'Removes a KYC document record by ID. Only the owning tenant can delete their own documents.' })
  @ApiOkResponse()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  async deleteKycDocument(
    @Param('docId') docId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.deleteKycDocumentUseCase.execute(accessToken, docId);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof KycDocumentNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('onboarding/devices/provision')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit device provisioning request', description: 'Submits a fleet device provisioning request (manufacturer, model, quantity). Reviewed by system team.' })
  @ApiCreatedResponse()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async submitDeviceProvisioningRequest(
    @Body(BodyOrDataPipe) payload: SubmitDeviceProvisioningRequestDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.submitDeviceProvisioningRequestUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('onboarding/sims/register')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register individual SIMs', description: 'Registers one or more SIMs (by ICCID + mobile number + operator) directly to the tenant in the SIM inventory.' })
  @ApiCreatedResponse()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async registerSims(
    @Body(BodyOrDataPipe) payload: RegisterSimsDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.registerSimsUseCase.execute(accessToken, payload.sims);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('onboarding/sims/import')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Bulk CSV SIM import', description: 'Accepts a CSV file with columns iccid, msisdn, carrier and bulk-registers the SIMs.' })
  @ApiCreatedResponse()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiBadRequestResponse({ description: 'Invalid CSV or missing required column: iccid' })
  @UseInterceptors(FileInterceptor('file'))
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary', description: 'CSV with columns: iccid, msisdn, carrier' } },
    },
  })
  async importSimsCsv(
    @UploadedFile() file?: { buffer: Buffer },
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    if (!file?.buffer?.length) throw new BadRequestException('Missing CSV file');
    try {
      return await this.importSimsCsvUseCase.execute(accessToken, file.buffer);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof InvalidCsvError) throw new BadRequestException(error.message);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('onboarding/sims/provision')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit SIM provisioning request', description: 'Submits a SIM provisioning request to Fonu. Reviewed and fulfilled by the system team.' })
  @ApiCreatedResponse()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  async submitSimProvisioningRequest(
    @Body(BodyOrDataPipe) payload: SubmitSimProvisioningRequestDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.submitSimProvisioningRequestUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Put('onboarding/features')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save feature toggle preferences', description: 'Updates feature toggles (live_tracking, geofencing, etc.) on the tenant onboarding record.' })
  @ApiOkResponse()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiNotFoundResponse({ description: 'Onboarding record not found' })
  async saveFeatureToggles(
    @Body(BodyOrDataPipe) payload: SaveFeatureTogglesDto,
    @Headers('authorization') authorization?: string,
  ) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.saveFeatureTogglesUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof OnboardingNotFoundForFeaturesError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Post('onboarding/complete')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark onboarding as complete', description: 'Sets onboarding_completed_at server-side so completion persists across devices and sessions.' })
  @ApiCreatedResponse()
  @ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
  @ApiConflictResponse({ description: 'Onboarding already completed' })
  async completeOnboarding(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.completeOnboardingUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  // ─── SIM Inventory (tenant) ───────────────────────────────────────────────

  @Get('sims')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List tenant SIMs' })
  @ApiOkResponse()
  async listTenantSims(@Query() query: ListSimsQueryDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listTenantSimsUseCase.execute(accessToken, query);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('sims/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export tenant SIMs' })
  @ApiProduces('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportTenantSims(@Query() query: ListSimsQueryDto, @Headers('authorization') authorization?: string, @Res({ passthrough: true }) res?: Response) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.exportTenantSimsUseCase.execute(accessToken, query);
      (res as any).set({ 'Content-Type': result.contentType, 'Content-Disposition': `attachment; filename="sims-export.${result.ext}"` });
      return new StreamableFile(result.buffer);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('sims/import/template')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download SIM import CSV template' })
  @ApiProduces('text/csv')
  getSimImportTemplate(@Res({ passthrough: true }) res?: Response) {
    const { csv, filename } = this.getSimImportTemplateUseCase.execute();
    (res as any).set({ 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="${filename}"` });
    return new StreamableFile(Buffer.from(csv));
  }

  @Post('sims/import')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Import SIMs from CSV' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async importTenantSimsCsv(@UploadedFile() file: { buffer: Buffer }, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    if (!file?.buffer) throw new BadRequestException('Missing file');
    try {
      return await this.importTenantSimsCsvUseCase.execute(accessToken, file.buffer);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof CsvParseError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Get('sims/carriers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active carriers for tenants' })
  async listSimCarriers(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listCarriersUseCase.execute(accessToken, true);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      throw error;
    }
  }

  @Get('sims/data-bundles')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List bundle plans for tenants' })
  async listSimDataBundles(@Query('carrierId') carrierId?: string, @Query('billingCycle') billingCycle?: string, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listBundleCatalogUseCase.execute(accessToken, { carrierId, billingCycle, activeOnly: true });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      throw error;
    }
  }

  @Get('sims/requests')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List tenant SIM requests' })
  async listTenantSimRequests(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listTenantSimRequestsUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('sims/requests/device-mapping/template')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download device mapping CSV template' })
  @ApiProduces('text/csv')
  getDeviceMappingTemplate(@Res({ passthrough: true }) res?: Response) {
    const { csv, filename } = this.getDeviceMappingTemplateUseCase.execute();
    (res as any).set({ 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="${filename}"` });
    return new StreamableFile(Buffer.from(csv));
  }

  @Post('sims/requests/device-mapping')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload device mapping CSV' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDeviceMappingCsv(@UploadedFile() file: { buffer: Buffer }, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    if (!file?.buffer) throw new BadRequestException('Missing file');
    try {
      return await this.uploadDeviceMappingCsvUseCase.execute(accessToken, file.buffer);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('sims/requests')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit SIM provisioning request' })
  @ApiCreatedResponse()
  async submitTenantSimRequest(@Body() payload: SubmitSimRequestDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.submitTenantSimRequestUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('sims/requests/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get tenant SIM request detail' })
  async getTenantSimRequest(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getTenantSimRequestUseCase.execute(accessToken, id);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof TenantSimNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Post('sims')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register a SIM' })
  @ApiCreatedResponse()
  async registerTenantSim(@Body() payload: RegisterTenantSimDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.registerTenantSimUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('sims/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get SIM detail' })
  async getTenantSim(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getTenantSimUseCase.execute(accessToken, id);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof TenantSimNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Patch('sims/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update SIM' })
  async updateTenantSim(@Param('id') id: string, @Body() payload: UpdateTenantSimDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.updateTenantSimUseCase.execute(accessToken, id, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof TenantSimNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Post('sims/:id/suspend')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Suspend SIM' })
  async suspendTenantSim(@Param('id') id: string, @Body() payload: SuspendSimDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.suspendTenantSimUseCase.execute(accessToken, id, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof TenantSimNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Post('sims/:id/reactivate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reactivate SIM' })
  async reactivateTenantSim(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.reactivateTenantSimUseCase.execute(accessToken, id);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof TenantSimNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Delete('sims/:id/device')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unassign device from SIM' })
  async unassignDeviceFromSim(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.unassignDeviceFromSimUseCase.execute(accessToken, id);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof TenantSimNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Delete('sims/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete SIM' })
  async deleteTenantSim(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.deleteTenantSimUseCase.execute(accessToken, id);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof TenantSimNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  // ─── System: Carriers & Bundle Catalog ────────────────────────────────────

  @Post('system/carriers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create carrier (system admin)' })
  @ApiCreatedResponse()
  async createSystemCarrier(@Body() payload: CreateCarrierDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.createSystemCarrierUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Patch('system/carriers/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update carrier (system admin)' })
  async updateSystemCarrier(@Param('id') id: string, @Body() payload: UpdateCarrierDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.updateSystemCarrierUseCase.execute(accessToken, id, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('system/bundle-catalog')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create bundle plan (system admin)' })
  @ApiCreatedResponse()
  async createSystemBundle(@Body() payload: CreateBundleDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.createSystemBundleUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Patch('system/bundle-catalog/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update bundle plan (system admin)' })
  async updateSystemBundle(@Param('id') id: string, @Body() payload: UpdateBundleDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.updateSystemBundleUseCase.execute(accessToken, id, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Delete('system/bundle-catalog/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete bundle plan (system admin)' })
  async deleteSystemBundle(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.deleteSystemBundleUseCase.execute(accessToken, id);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  // ─── Data Bundle Dashboard ─────────────────────────────────────────────────

  @Get('data-bundles/summary')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get data bundle dashboard summary' })
  async getBundleSummary(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getBundleSummaryUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('data-bundles/wallet/balance')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get wallet balance' })
  async getWalletBalance(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getWalletBalanceUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('data-bundles/wallet/topup')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Top up wallet via mobile money (stub)' })
  @ApiCreatedResponse()
  async topUpWallet(@Body() payload: TopUpWalletDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.topUpWalletUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('data-bundles/spending-limit')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get spending limit settings' })
  async getSpendingLimit(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSpendingLimitUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('data-bundles/spending-limit')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save spending limit settings' })
  @ApiCreatedResponse()
  async saveSpendingLimit(@Body() payload: SaveSpendingLimitDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.saveSpendingLimitUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Delete('data-bundles/spending-limit')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable spending limit' })
  async disableSpendingLimit(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.disableSpendingLimitUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('data-bundles/auto-topup')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get auto top-up settings' })
  async getAutoTopUp(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getAutoTopUpUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('data-bundles/auto-topup')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save auto top-up settings' })
  @ApiCreatedResponse()
  async saveAutoTopUp(@Body() payload: SaveAutoTopUpDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.saveAutoTopUpUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Delete('data-bundles/auto-topup')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable auto top-up' })
  async disableAutoTopUp(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.disableAutoTopUpUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('data-bundles/allocations')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List bundle allocations' })
  async listBundleAllocations(@Query() query: ListAllocationsQueryDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listBundleAllocationsUseCase.execute(accessToken, query);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('data-bundles/allocations/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export bundle allocations' })
  @ApiProduces('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportBundleAllocations(@Query() query: ListAllocationsQueryDto, @Headers('authorization') authorization?: string, @Res({ passthrough: true }) res?: Response) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.exportBundleAllocationsUseCase.execute(accessToken, query);
      (res as any).set({ 'Content-Type': result.contentType, 'Content-Disposition': `attachment; filename="${result.filename}"` });
      return new StreamableFile(result.buffer);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('data-bundles/allocations/sims')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List SIMs available for bundle allocation' })
  async listSimsForAllocation(@Query('search') search?: string, @Query('carrierId') carrierId?: string, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listSimsForAllocationUseCase.execute(accessToken, { search, carrierId });
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Post('data-bundles/allocations')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Allocate bundle to SIMs' })
  @ApiCreatedResponse()
  async allocateBundle(@Body() payload: AllocateBundleDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.allocateBundleUseCase.execute(accessToken, payload);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof Error && error.message.includes('Insufficient')) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Get('data-bundles/allocations/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get bundle allocation detail' })
  async getBundleAllocation(@Param('id') id: string, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getBundleAllocationUseCase.execute(accessToken, id);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      if (error instanceof TenantSimNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }

  @Get('data-bundles/transactions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List bundle transactions' })
  async listBundleTransactions(@Query() query: ListTransactionsQueryDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listBundleTransactionsUseCase.execute(accessToken, query);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('data-bundles/transactions/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export bundle transactions' })
  @ApiProduces('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportBundleTransactions(@Query() query: ListTransactionsQueryDto, @Headers('authorization') authorization?: string, @Res({ passthrough: true }) res?: Response) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.exportBundleTransactionsUseCase.execute(accessToken, query);
      (res as any).set({ 'Content-Type': result.contentType, 'Content-Disposition': `attachment; filename="${result.filename}"` });
      return new StreamableFile(result.buffer);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('data-bundles/analytics/spend-trend')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get spend trend analytics' })
  async getSpendTrend(@Query() query: AnalyticsRangeDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSpendTrendUseCase.execute(accessToken, query.range ?? '30d', query.startDate, query.endDate);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('data-bundles/analytics/spend-breakdown')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get spend breakdown analytics' })
  async getSpendBreakdown(@Query() query: AnalyticsRangeDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSpendBreakdownUseCase.execute(accessToken, query.range ?? '30d', query.startDate, query.endDate);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('data-bundles/analytics/carrier-distribution')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get carrier distribution analytics' })
  async getCarrierDistribution(@Query() query: AnalyticsRangeDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getCarrierDistributionUseCase.execute(accessToken, query.range ?? '30d', query.startDate, query.endDate);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('data-bundles/analytics/subscription-usage')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get subscription usage analytics' })
  async getSubscriptionUsage(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.getSubscriptionUsageUseCase.execute(accessToken);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('data-bundles/rates')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List bundle rates' })
  async listBundleRates(@Query() query: ListBundleRatesQueryDto, @Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listBundleRatesUseCase.execute(accessToken, query);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('data-bundles/rates/export')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Export bundle rates' })
  @ApiProduces('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async exportBundleRates(@Query() query: ListBundleRatesQueryDto, @Headers('authorization') authorization?: string, @Res({ passthrough: true }) res?: Response) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      const result = await this.exportBundleRatesUseCase.execute(accessToken, query);
      (res as any).set({ 'Content-Type': result.contentType, 'Content-Disposition': `attachment; filename="${result.filename}"` });
      return new StreamableFile(result.buffer);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      if (error instanceof ForbiddenError) throw new ForbiddenException(error.message);
      throw error;
    }
  }

  @Get('data-bundles/carriers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List carriers for data bundles' })
  async listDataBundleCarriers(@Headers('authorization') authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) throw new UnauthorizedException('Missing authorization');
    try {
      return await this.listCarriersUseCase.execute(accessToken, true);
    } catch (error) {
      this.rethrowInvalidAccessToken(error);
      throw error;
    }
  }

  private async storeUploadedMedia(
    service: 'auth' | 'fleet',
    file?: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing upload file');
    }

    const extension = extname(file.originalname);
    const baseName = file.originalname.slice(
      0,
      file.originalname.length - extension.length,
    );
    const normalizedBaseName =
      baseName
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'file';
    const key = `${service}/media/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${normalizedBaseName}${extension.toLowerCase()}`;
    const usePublicMediaUrl = this.objectStorageService.hasPublicBaseUrl();

    try {
      await this.objectStorageService.putObject({
        key,
        body: file.buffer,
        contentType: file.mimetype,
        // Profile and organization branding images are display media, so they can
        // live in a public bucket/root when configured. Private business documents
        // such as fleet attachments still use presigned URLs elsewhere.
        visibility: usePublicMediaUrl ? 'public' : 'private',
      });

      const url =
        (usePublicMediaUrl ? this.objectStorageService.publicUrl(key) : null) ??
        (await this.objectStorageService.createPresignedDownloadUrl({ key }));

      return {
        key,
        url,
        filename: file.originalname,
        contentType: file.mimetype,
        size: file.size,
      };
    } catch {
      throw new ServiceUnavailableException('Media upload failed');
    }
  }
}
