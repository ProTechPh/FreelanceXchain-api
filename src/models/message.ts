/**
 * Message Model
 * Direct messaging between users
 */

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  content: string;
  isRead: boolean;
  attachments?: MessageAttachment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageAttachment {
  url: string;
  filename: string;
  size: number;
  mimeType: string;
}

export interface Conversation {
  id: string;
  participant1Id: string;
  participant2Id: string;
  lastMessageAt: Date;
  lastMessagePreview?: string;
  unreadCount1: number;
  unreadCount2: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageEntity {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  attachments?: MessageAttachment[];
  created_at: string;
  updated_at: string;
}

export interface ConversationEntity {
  id: string;
  participant1_id: string;
  participant2_id: string;
  last_message_at: string;
  last_message_preview?: string;
  unread_count_1: number;
  unread_count_2: number;
  created_at: string;
  updated_at: string;
}

export interface SendMessageInput {
  senderId: string;
  receiverId: string;
  content: string;
  attachments?: MessageAttachment[];
}
