import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { IdGenerator } from "@auth/session/domain/ports/id-generator.port";

@Injectable()
export class UuidIdGenerator implements IdGenerator {
  generate(): string {
    return randomUUID();
  }
}
