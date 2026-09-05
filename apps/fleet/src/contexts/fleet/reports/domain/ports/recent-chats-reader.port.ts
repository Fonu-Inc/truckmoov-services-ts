export type RecentChat = {
  id: string;
  contactName: string;
  channel: "whatsapp" | "sms";
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
};

export interface RecentChatsReader {
  listRecentChats(tenantId: string, limit: number): Promise<RecentChat[]>;
}

export const RECENT_CHATS_READER = Symbol("RECENT_CHATS_READER");
