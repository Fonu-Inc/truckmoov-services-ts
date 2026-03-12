import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const BodyOrData = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ body?: unknown }>();
    const body = request.body;

    if (
      body &&
      typeof body === "object" &&
      "data" in body &&
      body.data &&
      typeof body.data === "object"
    ) {
      return body.data;
    }

    return body;
  },
);
