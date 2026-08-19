import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { InjectMetric } from "@willsoto/nestjs-prometheus";
import type { Counter, Histogram } from "prom-client";
import { Observable, tap } from "rxjs";

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric("http_request_duration_seconds")
    private readonly duration: Histogram<string>,
    @InjectMetric("http_requests_total")
    private readonly total: Counter<string>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest();
    const start = process.hrtime.bigint();

    const record = (): void => {
      const response = http.getResponse();
      const route = request.route?.path ?? request.url ?? "unknown";
      const labels = {
        method: request.method,
        route,
        status_code: String(response.statusCode),
      };
      this.duration.observe(labels, Number(process.hrtime.bigint() - start) / 1e9);
      this.total.inc(labels);
    };

    return next.handle().pipe(tap({ next: record, error: record }));
  }
}
