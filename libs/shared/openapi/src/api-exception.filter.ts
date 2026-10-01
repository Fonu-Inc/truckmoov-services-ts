import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Inject, Logger } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { toErrorBody } from "./error-body";

/** Writes every HTTP error in the response contract. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("ApiExceptionFilter");

  constructor(@Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost) {
    if (!(exception instanceof HttpException)) this.logger.error(exception);
    if (host.getType<string>() !== "http") return;

    const body = toErrorBody(exception);
    this.adapterHost.httpAdapter.reply(host.switchToHttp().getResponse(), body, body.statusCode);
  }
}
