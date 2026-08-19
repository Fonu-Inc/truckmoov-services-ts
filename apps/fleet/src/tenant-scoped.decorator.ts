import { applyDecorators, SetMetadata, UseGuards } from "@nestjs/common";
import { TenantGuard } from "./tenant.guard";

export const TENANT_SCOPED_KEY = "tenant_scoped";

export function TenantScoped(): ReturnType<typeof applyDecorators> {
  return applyDecorators(SetMetadata(TENANT_SCOPED_KEY, true), UseGuards(TenantGuard));
}
