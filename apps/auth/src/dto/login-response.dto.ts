import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiProperty, ApiPropertyOptional, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { StandardApiResponse } from '@shared/openapi';

export class LoginSessionUserSchema {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ example: 'OWNER_OPERATOR' }) role!: string;
  @ApiProperty() tenantId!: string;
}

export class LoginSessionSchema {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty({ example: 3600, description: 'Seconds the access token lasts.' }) expiresIn!: number;
  @ApiProperty({ type: LoginSessionUserSchema }) user!: LoginSessionUserSchema;
}

export class LoginSessionResponse extends StandardApiResponse<LoginSessionSchema> {
  @ApiProperty({ type: LoginSessionSchema }) data!: LoginSessionSchema;
}

export class TwoFactorChallengeSchema {
  @ApiProperty({ enum: [true] }) twoFactorRequired!: true;
  @ApiProperty({ enum: ['code'] }) step!: 'code';
  @ApiProperty({
    description: 'Send back with the code to the same portal\'s two-factor route. Lasts five minutes and works once.',
  })
  challengeToken!: string;
}

export class TwoFactorChallengeResponse extends StandardApiResponse<TwoFactorChallengeSchema> {
  @ApiProperty({ type: TwoFactorChallengeSchema }) data!: TwoFactorChallengeSchema;
}

/** A session, or, for someone who turned two-factor on, the challenge the code step needs. */
export function ApiLoginResponse() {
  return applyDecorators(
    ApiExtraModels(LoginSessionResponse, TwoFactorChallengeResponse),
    ApiResponse({
      status: 201,
      description: 'Signed in, or a code is owed: twoFactorRequired marks the challenge',
      schema: {
        oneOf: [{ $ref: getSchemaPath(LoginSessionResponse) }, { $ref: getSchemaPath(TwoFactorChallengeResponse) }],
      },
    }),
  );
}

export class TwoFactorEnrolmentSchema {
  @ApiProperty({ description: 'Shown once; the authenticator app is set up with it.' }) secret!: string;
  @ApiProperty({ description: 'Render as a QR code.' }) otpauthUri!: string;
}

export class EnrolmentChallengeSchema {
  @ApiProperty({ enum: [true] }) twoFactorRequired!: true;
  @ApiProperty({ enum: ['enrolment'] }) step!: 'enrolment';
  @ApiProperty({ description: 'Send back with the first code to POST /auth/system/login/two-factor.' }) challengeToken!: string;
  @ApiProperty({ type: TwoFactorEnrolmentSchema }) enrolment!: TwoFactorEnrolmentSchema;
}

export class EnrolmentChallengeResponse extends StandardApiResponse<EnrolmentChallengeSchema> {
  @ApiProperty({ type: EnrolmentChallengeSchema }) data!: EnrolmentChallengeSchema;
}

export class EnrolledSessionSchema extends LoginSessionSchema {
  @ApiPropertyOptional({
    type: [String],
    description: 'Present only when the code finished the first enrolment at sign-in. Shown once.',
  })
  recoveryCodes?: string[];
}

export class EnrolledSessionResponse extends StandardApiResponse<EnrolledSessionSchema> {
  @ApiProperty({ type: EnrolledSessionSchema }) data!: EnrolledSessionSchema;
}

/** The admin sign-in: a session, a code challenge, or, once the platform requires it, an enrolment challenge. */
export function ApiAdminLoginResponse() {
  return applyDecorators(
    ApiExtraModels(LoginSessionResponse, TwoFactorChallengeResponse, EnrolmentChallengeResponse),
    ApiResponse({
      status: 201,
      description: 'Signed in, or a code is owed: step is "code", or "enrolment" while the platform requires two-factor',
      schema: {
        oneOf: [
          { $ref: getSchemaPath(LoginSessionResponse) },
          { $ref: getSchemaPath(TwoFactorChallengeResponse) },
          { $ref: getSchemaPath(EnrolmentChallengeResponse) },
        ],
      },
    }),
  );
}
