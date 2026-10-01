import { ArgumentsHost, Catch, HttpException } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { ApiExceptionFilter } from "@shared/openapi";
import { NodeEnv, type AppConfigService } from "@shared/config";
import * as Sentry from "@sentry/node";

let processHandlersRegistered = false;

function isSentryEnabled(config: AppConfigService) {
  return config.app.env === NodeEnv.Production && config.sentry.dsn.length > 0;
}

export function initializeSentry(config: AppConfigService) {
  if (!isSentryEnabled(config)) {
    return false;
  }

  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.sentry.environment,
  });

  return true;
}

export function registerSentryProcessHandlers() {
  if (processHandlersRegistered) {
    return;
  }

  processHandlersRegistered = true;

  process.on("unhandledRejection", (reason) => {
    Sentry.captureException(reason);
  });

  process.on("uncaughtException", (error) => {
    Sentry.captureException(error);
    void Sentry.flush(2_000);
  });
}

/**
 * Reports, then answers in the response contract. Capturing is a no-op until
 * initializeSentry has run, so this is safe to register everywhere.
 */
@Catch()
export class SentryExceptionFilter extends ApiExceptionFilter {
  constructor(adapterHost: HttpAdapterHost, private readonly serviceName: string) {
    super(adapterHost);
  }

  override catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;

    Sentry.withScope((scope) => {
      scope.setTag("service", this.serviceName);
      scope.setTag("exception.origin", host.getType<string>());
      scope.setLevel(status >= 500 ? "error" : "warning");
      scope.setContext("http", this.getHttpContext(host));
      Sentry.captureException(exception);
    });

    super.catch(exception, host);
  }

  private getHttpContext(host: ArgumentsHost) {
    if (host.getType<string>() !== "http") {
      return null;
    }

    const request = host.switchToHttp().getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
      headers?: Record<string, unknown>;
    }>();

    return {
      method: request?.method,
      url: request?.originalUrl ?? request?.url,
      userAgent:
        typeof request?.headers?.["user-agent"] === "string"
          ? request.headers["user-agent"]
          : undefined,
    };
  }
}
