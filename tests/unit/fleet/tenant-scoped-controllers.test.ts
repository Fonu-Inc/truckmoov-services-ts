import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { PUBLIC_ROUTE_KEY } from "@shared/rbac";
import { AppModule } from "../../../apps/fleet/src/app.module";
import { TENANT_SCOPED_KEY } from "../../../apps/fleet/src/tenant-scoped.decorator";

describe("fleet controllers", () => {
  it("each declares tenant scoping, so the boot check never refuses to start", () => {
    const controllers: Function[] = Reflect.getMetadata("controllers", AppModule) ?? [];
    const unmarked = controllers
      .filter((c) => Reflect.getMetadata(TENANT_SCOPED_KEY, c) !== true && Reflect.getMetadata(PUBLIC_ROUTE_KEY, c) !== true)
      .map((c) => c.name);

    expect(controllers.length).toBeGreaterThan(0);
    expect(unmarked).toEqual([]);
  });
});
