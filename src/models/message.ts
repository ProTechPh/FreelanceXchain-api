/**
 * Message Model
 * Direct messaging between users
 */

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  content: string;
  isRead: boolean;
  attachments?: MessageAttachment[];
  createdAt: string;
  updatedAt: string;
};

export type MessageAttachment = {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
};

export type Conversation = {
  id: string;
  participant1Id: string;
  participant2Id: string;
  lastMessageAt: string;
  lastMessagePreview?: string;
  unreadCount1: number;
  unreadCount2: number;
  createdAt: string;
  updatedAt: string;
};

export type MessageEntity = {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  attachments?: MessageAttachment[];
  created_at: string;
  updated_at: string;
};

export type ConversationEntity = {
  id: string;
  participant1_id: string;
  participant2_id: string;
  last_message_at: string;
  last_message_preview?: string;
  unread_count_1: number;
  unread_count_2: number;
  created_at: string;
  updated_at: string;
};

export type SendMessageInput = {
  senderId: string;
  receiverId: string;
  content: string;
  attachments?: MessageAttachment[];
};
