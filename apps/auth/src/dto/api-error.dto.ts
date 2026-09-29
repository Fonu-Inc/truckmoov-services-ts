import { applyDecorators, type Type } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiProperty,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { IDENTITY_CLAIM_TYPES, ONBOARDING_DOCUMENT_TYPES } from '@auth/onboarding';
import { OnboardingVehicleMissingDocumentSchema } from './onboarding-application-response.dto';

export class ApiErrorBody {
  @ApiProperty({ example: 404 }) statusCode!: number;
  @ApiProperty({ example: 'Application not found' }) message!: string;
  @ApiProperty({
    example: 'Not Found',
    required: false,
    description:
      'The status name. Absent on a bare HttpException, such as the 429 rate limits.',
  })
  error?: string;
}

export class ApiValidationErrorBody {
  @ApiProperty({ example: 400 }) statusCode!: number;
  @ApiProperty({
    type: [String],
    example: ['property foo should not exist'],
    description: 'One entry per rejected property, from the global ValidationPipe.',
  })
  message!: string[];
  @ApiProperty({ example: 'Bad Request' }) error!: string;
}

export class OnboardingFieldErrorBody {
  @ApiProperty({ example: 'Organization name is required' }) message!: string;
  @ApiProperty({ example: 'organizationName', description: 'The request field at fault.' })
  field!: string;
}

export class OnboardingIncompleteErrorBody {
  @ApiProperty({
    example: 'This application cannot be submitted yet: the business email is not verified',
  })
  message!: string;
  @ApiProperty() emailVerified!: boolean;
  @ApiProperty() phoneVerified!: boolean;
  @ApiProperty({ enum: [...ONBOARDING_DOCUMENT_TYPES], isArray: true })
  missingDocuments!: string[];
  @ApiProperty({ type: [OnboardingVehicleMissingDocumentSchema] })
  vehiclesMissingDocuments!: OnboardingVehicleMissingDocumentSchema[];
  @ApiProperty() vehicleCount!: number;
  @ApiProperty() requestedDevices!: number;
  @ApiProperty({
    description:
      'False while the device gate fails. Devices must equal vehicles, unless the disclosed stock shortfall was accepted (inventoryShortfallAccepted).',
  })
  deviceAllocationComplete!: boolean;
  @ApiProperty({
    description:
      'True when the customer confirmed a stock shortfall and the devices requested match the quantity that was available then.',
  })
  inventoryShortfallAccepted!: boolean;
  @ApiProperty() indemnitySigned!: boolean;
  @ApiProperty() planSelected!: boolean;
}

export class DuplicateIdentityErrorBody {
  @ApiProperty({
    example: 'These details are already on another application: CAC registration number.',
  })
  message!: string;
  @ApiProperty({ enum: [...IDENTITY_CLAIM_TYPES], isArray: true })
  claimTypes!: string[];
}

/** One documented error status. Several bodies become a oneOf. */
export function ApiErrorResponse(
  status: number,
  description: string,
  ...bodies: Type<unknown>[]
) {
  const models = bodies.length > 0 ? bodies : [ApiErrorBody];
  if (models.length === 1) {
    return ApiResponse({ status, description, type: models[0] });
  }
  return applyDecorators(
    ApiExtraModels(...models),
    ApiResponse({
      status,
      description,
      schema: { oneOf: models.map((model) => ({ $ref: getSchemaPath(model) })) },
    }),
  );
}

export class CodeCooldownErrorBody {
  @ApiProperty({ example: 'Too many wrong codes, try again in 42 seconds' }) message!: string;
  @ApiProperty({ example: 42, description: 'Seconds until a code is checked again.' })
  retryAfterSeconds!: number;
}

export const CodeAttemptsLimited = () =>
  ApiErrorResponse(
    429,
    'Per-IP limit: { statusCode: 429, message: "Too many login attempts, please try again later" }. After 3 wrong codes in a row on the account, every code is refused unchecked for 60 seconds: { message: "Too many wrong codes, try again in <n> seconds", retryAfterSeconds }. A sign-in challenge refused this way stays usable until it expires.',
    CodeCooldownErrorBody,
    ApiErrorBody,
  );
