import { getSupabaseClient } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import { messageRepository } from '../repositories/message-repository.js';
import { MessageEntity, ConversationEntity, SendMessageInput } from '../models/message.js';

const supabase = getSupabaseClient();

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface ConversationWithDetails extends ConversationEntity {
  otherUser?: {
    id: string;
    name: string;
    email: string;
  };
}

/**
 * Send a message to another user
 */
export async function sendMessage(data: SendMessageInput): Promise<ServiceResult<MessageEntity>> {
  try {
    const { senderId, receiverId, content, attachments } = data;

    // Validate input
    if (!content || content.trim().length === 0) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Message content is required',
        },
      };
    }

    // Check if receiver exists
    const { data: receiver, error: receiverError } = await supabase
      .from('users')
      .select('id')
      .eq('id', receiverId)
      .single();

    if (receiverError || !receiver) {
      return {
        success: false,
        error: {
          code: 'RECEIVER_NOT_FOUND',
          message: 'Receiver not found',
        },
      };
    }

    // Find or create conversation
    let conversation = await messageRepository.findConversation(senderId, receiverId);
    
    if (!conversation) {
      conversation = await messageRepository.createConversation(senderId, receiverId);
    }

    // Create message
    const message = await messageRepository.createMessage({
      conversation_id: conversation.id,
      sender_id: senderId,
      receiver_id: receiverId,
      content: content.trim(),
      is_read: false,
      ...(attachments !== undefined ? { attachments } : {}),
    });

    // Update conversation metadata
    const isParticipant1 = conversation.participant1_id === senderId;
    const updates: Partial<ConversationEntity> = {
      last_message_at: new Date().toISOString(),
      last_message_preview: content.substring(0, 100),
    };

    // Increment unread count for receiver
    if (isParticipant1) {
      updates.unread_count_2 = (conversation.unread_count_2 || 0) + 1;
    } else {
      updates.unread_count_1 = (conversation.unread_count_1 || 0) + 1;
    }

    await messageRepository.updateConversation(conversation.id, updates);

    // TODO: Trigger notification for receiver
    logger.debug('Message sent successfully', { messageId: message.id, conversationId: conversation.id });

    return {
      success: true,
      data: message,
    };
  } catch (error) {
    logger.error('Unexpected error in sendMessage', { error, data });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}

/**
 * Get user's conversations with pagination
 */
export async function getConversations(
  userId: string,
  options: PaginationOptions = {}
): Promise<ServiceResult<PaginatedResult<ConversationWithDetails>>> {
  try {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    const { items, total } = await messageRepository.getUserConversations(userId, limit, offset);

    // Enrich with other user details
    const enrichedConversations = await Promise.all(
      items.map(async (conv) => {
        const otherUserId = conv.participant1_id === userId ? conv.participant2_id : conv.participant1_id;
        
        const { data: otherUser } = await supabase
          .from('users')
          .select('id, name, email')
          .eq('id', otherUserId)
          .single();

        return {
          ...conv,
          otherUser: otherUser || undefined,
        } as ConversationWithDetails;
      })
    );

    return {
      success: true,
      data: {
        items: enrichedConversations,
        total,
        hasMore: offset + limit < total,
      },
    };
  } catch (error) {
    logger.error('Unexpected error in getConversations', { error, userId, options });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}

/**
 * Get messages in a conversation
 */
export async function getConversationMessages(
  conversationId: string,
  userId: string,
  options: PaginationOptions = {}
): Promise<ServiceResult<PaginatedResult<MessageEntity>>> {
  try {
    // Verify user is participant
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('participant1_id, participant2_id')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      return {
        success: false,
        error: {
          code: 'CONVERSATION_NOT_FOUND',
          message: 'Conversation not found',
        },
      };
    }

    if (conversation.participant1_id !== userId && conversation.participant2_id !== userId) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You are not a participant in this conversation',
        },
      };
    }

    const page = options.page || 1;
    const limit = options.limit || 50;
    const offset = (page - 1) * limit;

    const { items, total } = await messageRepository.getConversationMessages(conversationId, limit, offset);

    return {
      success: true,
      data: {
        items,
        total,
        hasMore: offset + limit < total,
      },
    };
  } catch (error) {
    logger.error('Unexpected error in getConversationMessages', { error, conversationId, userId, options });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}

/**
 * Mark conversation as read
 */
export async function markConversationAsRead(
  conversationId: string,
  userId: string
): Promise<ServiceResult<void>> {
  try {
    // Verify user is participant
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('participant1_id, participant2_id')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      return {
        success: false,
        error: {
          code: 'CONVERSATION_NOT_FOUND',
          message: 'Conversation not found',
        },
      };
    }

    if (conversation.participant1_id !== userId && conversation.participant2_id !== userId) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'You are not a participant in this conversation',
        },
      };
    }

    // Mark messages as read
    await messageRepository.markMessagesAsRead(conversationId, userId);

    // Reset unread count
    const isParticipant1 = conversation.participant1_id === userId;
    const updates = isParticipant1
      ? { unread_count_1: 0 }
      : { unread_count_2: 0 };

    await messageRepository.updateConversation(conversationId, updates);

    return {
      success: true,
    };
  } catch (error) {
    logger.error('Unexpected error in markConversationAsRead', { error, conversationId, userId });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}

/**
 * Get unread message count for user
 */
export async function getUnreadMessageCount(userId: string): Promise<ServiceResult<number>> {
  try {
    const count = await messageRepository.getUnreadCount(userId);

    return {
      success: true,
      data: count,
    };
  } catch (error) {
    logger.error('Unexpected error in getUnreadMessageCount', { error, userId });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}
