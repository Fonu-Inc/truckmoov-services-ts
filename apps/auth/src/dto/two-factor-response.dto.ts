import { ApiProperty } from '@nestjs/swagger';
import { StandardApiResponse } from '@shared/openapi';

export class TwoFactorStatusSchema {
  @ApiProperty() enrolled!: boolean;
  @ApiProperty({ description: 'Enrolment begun but no code confirmed yet.' }) pendingConfirmation!: boolean;
  @ApiProperty({ description: 'Turning it off is refused while this is true.' }) requiredByPlatform!: boolean;
  @ApiProperty({ example: 8 }) recoveryCodesRemaining!: number;
}

export class TwoFactorStatusResponse extends StandardApiResponse<TwoFactorStatusSchema> {
  @ApiProperty({ type: TwoFactorStatusSchema }) data!: TwoFactorStatusSchema;
}

export class TwoFactorEnrolmentSchema {
  @ApiProperty({ description: 'Base32. Shown once.' }) secret!: string;
  @ApiProperty({ example: 'otpauth://totp/TruckMoov:tunde%40example.com?secret=…&issuer=TruckMoov' }) otpauthUri!: string;
}

export class TwoFactorEnrolmentResponse extends StandardApiResponse<TwoFactorEnrolmentSchema> {
  @ApiProperty({ type: TwoFactorEnrolmentSchema }) data!: TwoFactorEnrolmentSchema;
}

export class TwoFactorRecoveryCodesSchema {
  @ApiProperty({ type: [String], example: ['k3j9x-p2m7q'], description: 'Eight, each single use. Shown once.' })
  recoveryCodes!: string[];
}

export class TwoFactorRecoveryCodesResponse extends StandardApiResponse<TwoFactorRecoveryCodesSchema> {
  @ApiProperty({ type: TwoFactorRecoveryCodesSchema }) data!: TwoFactorRecoveryCodesSchema;
}

export class TwoFactorDisabledResponse extends StandardApiResponse<null> {
  @ApiProperty({ type: 'null', nullable: true, example: null }) data!: null;
}
