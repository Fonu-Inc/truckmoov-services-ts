import { HttpException, HttpStatus } from "@nestjs/common";
import { STATUS_CODES } from "node:http";

/**
 * The error half of the response contract every TruckMoov service answers
 * with, Go and TS alike. Extra fields an error carries (field, deviceIndex,
 * retryAfterSeconds...) ride alongside.
 */
export type ApiErrorBody = {
  status: false;
  message: string;
  error: string;
  statusCode: number;
  errors?: string[];
  [detail: string]: unknown;
};

export function toErrorBody(exception: unknown): ApiErrorBody {
  if (!(exception instanceof HttpException)) {
    return build(HttpStatus.INTERNAL_SERVER_ERROR, "Internal server error");
  }
  const statusCode = exception.getStatus();
  const response = exception.getResponse();
  if (typeof response === "string") return build(statusCode, response);

  const { message, error: _error, statusCode: _statusCode, status: _status, ...details } = response as Record<string, unknown>;
  const messages = Array.isArray(message) ? message.map(String) : [];
  const text = typeof message === "string" ? message : (messages[0] ?? exception.message);
  return {
    ...details,
    ...build(statusCode, text),
    ...(messages.length > 0 ? { errors: messages } : {}),
  };
}

function build(statusCode: number, message: string): ApiErrorBody {
  return { status: false, message, error: STATUS_CODES[statusCode] ?? "Error", statusCode };
}
