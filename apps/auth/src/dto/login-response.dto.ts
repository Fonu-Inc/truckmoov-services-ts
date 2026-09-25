import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiProperty, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { StandardApiResponse } from '@shared/openapi';

export class LoginSessionUserSchema {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ example: 'FLEET_ADMIN' }) role!: string;
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
