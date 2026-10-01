import { randomUUID } from "node:crypto";
import { Utils } from "@mikro-orm/core";
import type { MikroORM } from "@mikro-orm/postgresql";
import { getAuthOrm, type DbConfig } from "@auth/session/infrastructure/persistence/auth-orm";

function fromUrl(raw: string): DbConfig {
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    dbName: url.pathname.replace(/^\//, ""),
    poolMin: 0,
    poolMax: 5,
  };
}

function fromParts(): DbConfig | null {
  const host = process.env.TEST_DB_HOST;
  if (!host) return null;
  return {
    host,
    port: Number(process.env.TEST_DB_PORT ?? 5432),
    user: process.env.TEST_DB_USER ?? "test",
    password: process.env.TEST_DB_PASSWORD ?? "test",
    dbName: process.env.TEST_DB_NAME ?? "truckmoov_test",
    poolMin: 0,
    poolMax: 5,
  };
}

function resolveConfig(): DbConfig | null {
  const url = process.env.TEST_DATABASE_URL;
  return url ? fromUrl(url) : fromParts();
}

// MikroORM.init resets the import provider; pin it so migrations load through vite and @shared/* aliases resolve
Object.defineProperty(Utils, "dynamicImportProvider", {
  get: () => (id: string) => import(/* @vite-ignore */ id),
  set: () => undefined,
});

const config = resolveConfig();

export const dbEnabled = config !== null;

export function getConfig(): DbConfig {
  if (!config) throw new Error("test database not configured (TEST_DATABASE_URL)");
  return config;
}

// getAuthOrm caches per module instance and runs migrations under the shared advisory lock
export async function getOrm(): Promise<MikroORM> {
  return (await getAuthOrm(getConfig())) as unknown as MikroORM;
}

export function uniqueId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}
