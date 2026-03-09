import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { StandardApiResponse } from "./standard-response";

@Injectable()
export class TransformResponseInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<StandardApiResponse<unknown>> {
    return next.handle().pipe(map((data: unknown) => StandardApiResponse.ok(data)));
  }
}
