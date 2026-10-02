import axios from "axios";
import type { EventBus } from "@shared/eventbus";
import type { Portal, ServiceCaller } from "@shared/identity";
import type { PermissionKey } from "./catalog";

export const ACCESS_CHANGED_SUBJECT = "tm.system.access.changed";

export type RemoteAccess = {
  userId: string;
  tenantId: string;
  portal: Portal;
  active: boolean;
  permissions: PermissionKey[];
  /** The kind of organisation the user belongs to; null when auth knows none. */
  organizationType?: string | null;
};

const CACHE_TTL_MS = 30_000;
const NO_USER_TTL_MS = 10_000;
const USER_NOT_FOUND_TEXT = "user not found";

/**
 * Asks auth what a user may do right now, so a suspension or a role change
 * applies on the user's next request instead of when their token expires.
 * Cached briefly, and dropped the moment auth says the user changed.
 */
export class AccessClient {
  private readonly cache = new Map<string, { access: RemoteAccess | null; at: number }>();

  constructor(
    private readonly authUrl: string,
    private readonly caller: ServiceCaller,
  ) {}

  /** Keeps the cache honest across every running instance. */
  async listen(bus: EventBus): Promise<void> {
    await bus.subscribeEveryInstance?.(ACCESS_CHANGED_SUBJECT, async (event) => {
      const userId = (event.data as { userId?: unknown }).userId;
      if (typeof userId === "string") this.cache.delete(userId);
    });
  }

  /**
   * The user's access, null when auth knows no such user, or undefined when
   * auth could not be asked — which is not the same as suspended.
   */
  async get(userId: string): Promise<RemoteAccess | null | undefined> {
    const cached = this.cache.get(userId);
    if (cached && Date.now() - cached.at < (cached.access ? CACHE_TTL_MS : NO_USER_TTL_MS)) {
      return cached.access;
    }
    const headers = this.caller.headers("auth");
    if (!headers) return cached?.access;
    try {
      const response = await axios.get<{ data?: RemoteAccess; message?: unknown }>(
        `${this.authUrl}/auth/internal/access/${encodeURIComponent(userId)}`,
        { headers, timeout: 2000, validateStatus: () => true },
      );
      if (response.status === 404 && isUserNotFound(response.data)) return this.remember(userId, null);
      if (response.status !== 200 || !response.data?.data) return cached?.access;
      return this.remember(userId, response.data.data);
    } catch {
      return cached?.access;
    }
  }

  private remember(userId: string, access: RemoteAccess | null): RemoteAccess | null {
    this.cache.set(userId, { access, at: Date.now() });
    return access;
  }
}

function isUserNotFound(body: unknown): boolean {
  const message = (body as { message?: unknown } | null)?.message;
  return typeof message === "string" && message.trim().toLowerCase() === USER_NOT_FOUND_TEXT;
}
