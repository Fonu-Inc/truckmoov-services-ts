import { SetMetadata } from "@nestjs/common";

export const IDEMPOTENCY_KEY = "require_idempotency";
export const RequireIdempotency = () => SetMetadata(IDEMPOTENCY_KEY, true);
