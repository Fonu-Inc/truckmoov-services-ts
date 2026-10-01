import "reflect-metadata";
import { describe, expect, it } from "vitest";
import type { MiddlewareConsumer } from "@nestjs/common";
import { PUBLIC_ROUTE_KEY } from "@shared/rbac";
import { AppModule } from "../../../apps/fleet/src/app.module";

function authenticatedControllers(): unknown[] {
  const routes: unknown[] = [];
  const chain = {
    exclude: () => chain,
    forRoutes: (...controllers: unknown[]) => {
      routes.push(...controllers);
      return consumer;
    },
  };
  const consumer = { apply: () => chain } as unknown as MiddlewareConsumer;
  new AppModule().configure(consumer);
  return routes;
}

describe("fleet auth middleware", () => {
  // A controller left out gets no request.user, so every role-checked route
  // on it answers 401 to a valid token.
  it("covers every controller that is not public", () => {
    const controllers: Array<new (...args: never[]) => unknown> = Reflect.getMetadata("controllers", AppModule);
    const covered = authenticatedControllers();

    const missing = controllers
      .filter((controller) => !Reflect.getMetadata(PUBLIC_ROUTE_KEY, controller))
      .filter((controller) => !covered.includes(controller))
      .map((controller) => controller.name);

    expect(missing).toEqual([]);
  });
});
