import {
  ForbiddenException,
  Body,
  Controller,
  Param,
  Post,
  Inject,
  Headers,
  Patch,
  UnauthorizedException,
  Delete,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { BaseAuthController } from './base.controller';
import { ForbiddenError } from './contexts/auth/session';
import { CreateSystemBundleUseCase } from './create-system-bundle.use-case';
import { CreateSystemCarrierUseCase } from './create-system-carrier.use-case';
import { DeleteSystemBundleUseCase } from './delete-system-bundle.use-case';
import { SystemCarrierActionResponse, SystemBundleActionResponse, MessageResponse } from './dto/auth.schema';
import {
  UpdateBundleDto,
  CreateCarrierDto,
  CreateBundleDto,
  UpdateCarrierDto,
} from './dto/sim-management.dto';
import { UpdateSystemBundleUseCase } from './update-system-bundle.use-case';
import { UpdateSystemCarrierUseCase } from './update-system-carrier.use-case';

@ApiTags('System Billing')
@Controller('system')
export class SystemBillingController extends BaseAuthController {
  constructor(
    @Inject(ActivityLogService) activityLogService: ActivityLogService,
    @Inject(CreateSystemCarrierUseCase) private readonly createSystemCarrierUseCase: CreateSystemCarrierUseCase,
    @Inject(UpdateSystemCarrierUseCase) private readonly updateSystemCarrierUseCase: UpdateSystemCarrierUseCase,
    @Inject(CreateSystemBundleUseCase) private readonly createSystemBundleUseCase: CreateSystemBundleUseCase,
    @Inject(UpdateSystemBundleUseCase) private readonly updateSystemBundleUseCase: UpdateSystemBundleUseCase,
    @Inject(DeleteSystemBundleUseCase) private readonly deleteSystemBundleUseCase: DeleteSystemBundleUseCase,
  ) {
    super(activityLogService);
  }

  @Post('carriers')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create carrier (system admin)' })
  @ApiCreatedResponse({ type: SystemCarrierActionResponse })
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

  @Patch('carriers/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update carrier (system admin)' })
  @ApiOkResponse({ type: SystemCarrierActionResponse })
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

  @Post('bundle-catalog')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create bundle plan (system admin)' })
  @ApiCreatedResponse({ type: SystemBundleActionResponse })
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

  @Patch('bundle-catalog/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update bundle plan (system admin)' })
  @ApiOkResponse({ type: SystemBundleActionResponse })
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

  @Delete('bundle-catalog/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete bundle plan (system admin)' })
  @ApiOkResponse({ type: MessageResponse })
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
}
