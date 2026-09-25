import { applyDecorators } from '@nestjs/common';
import { ApiErrorBody, ApiErrorResponse, ApiValidationErrorBody } from './dto/api-error.dto';

const REFUSED_AS_NOT_FOUND = 'Under PORTAL_ENFORCEMENT=enforce, a caller outside the installer portal gets "Cannot <METHOD> <path>".';

export const JOB_NOT_FOUND = `"Installation job not found", for a missing job and another installer's alike`;
export const JOB_CHANGED = '"This job changed while the request was in flight. Reload it and try again."';

/** The refusals every installer route shares; `notFound` adds the route's own 404. */
export const InstallerErrors = (notFound?: string) =>
  applyDecorators(
    ApiErrorResponse(
      401,
      '"Missing authorization" without a bearer token, "Invalid or expired access token" for a bad one. Under PORTAL_ENFORCEMENT=enforce the guard answers a bad one with "missing or invalid authorization".',
    ),
    ApiErrorResponse(403, 'Not an active installer (suspended included): "This endpoint is reserved for installers".'),
    ApiErrorResponse(404, notFound ? `${notFound}. ${REFUSED_AS_NOT_FOUND}` : REFUSED_AS_NOT_FOUND),
  );

export const InvalidInstallerBody = (rules: string) =>
  ApiErrorResponse(
    400,
    `${rules} An unknown or mistyped property: the ValidationPipe array body.`,
    ApiErrorBody,
    ApiValidationErrorBody,
  );
