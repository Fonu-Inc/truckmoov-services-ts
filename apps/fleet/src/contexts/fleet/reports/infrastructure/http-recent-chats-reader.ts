import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHmac } from "node:crypto";
import axios from "axios";
import { AppConfigService } from "@shared/config";
import type { RecentChat, RecentChatsReader } from "../domain/ports/recent-chats-reader.port";

const REQUEST_TIMEOUT_MS = 5_000;
const TOKEN_TTL_SECONDS = 300;

type ConversationApi = {
  id?: string;
  driver_name?: string;
  driver_phone?: string;
  last_message_at?: string;
  last_message_preview?: string;
  last_message_direction?: string;
  unread_count?: number;
};

type ConversationEnvelope = {
  data?: ConversationApi[] | null;
};

@Injectable()
export class HttpRecentChatsReader implements RecentChatsReader {
  private readonly logger = new Logger(HttpRecentChatsReader.name);

  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  async listRecentChats(tenantId: string, limit: number): Promise<RecentChat[]> {
    const token = this.buildServiceToken(tenantId);
    if (!token) {
      this.logger.warn("chat read skipped: missing JWT secret or tenant");
      return [];
    }

    try {
      const baseUrl = this.config.overview.notificationServiceUrl.replace(/\/+$/, "");
      const res = await axios.get<ConversationEnvelope>(`${baseUrl}/notify/whatsapp/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: REQUEST_TIMEOUT_MS,
        validateStatus: () => true,
      });

      if (res.status < 200 || res.status >= 300 || !Array.isArray(res.data?.data)) {
        this.logger.warn(`chat read returned ${res.status}; degrading to no chats`);
        return [];
      }

      // The conversation store has no cheap "most recent N" query, so the
      // trimming happens here. The overview only ever renders a handful.
      return res.data.data
        .map((conversation) => this.toDomain(conversation))
        .sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt))
        .slice(0, limit);
    } catch (err) {
      this.logger.warn(`chat read failed: ${(err as Error).message}; degrading to no chats`);
      return [];
    }
  }

  private toDomain(conversation: ConversationApi): RecentChat {
    return {
      id: conversation.id ?? "",
      contactName: conversation.driver_name?.trim() || conversation.driver_phone || "Unknown contact",
      channel: "whatsapp",
      lastMessage: conversation.last_message_preview ?? "",
      lastMessageAt: conversation.last_message_at ?? "",
      unreadCount: conversation.unread_count ?? 0,
    };
  }

  private buildServiceToken(tenantId: string): string | null {
    const secret = this.config.auth.jwtSecret;
    const tid = tenantId?.trim();
    if (!secret || !tid) return null;

    const payload = {
      sub: "fleet-service",
      email: "fleet-service@truckmoov.local",
      role: "DISPATCHER",
      tenantId: tid,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
    return `${encodedPayload}.${signature}`;
  }
}
