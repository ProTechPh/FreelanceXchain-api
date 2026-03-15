import { getSupabaseServiceClient } from '../config/supabase.js';
import { logger } from '../config/logger.js';
import { messageRepository } from '../repositories/message-repository.js';
import { MessageEntity, ConversationEntity, SendMessageInput } from '../models/message.js';
import { notificationEmitter } from './notification-delivery-service.js';
import { generateId } from '../utils/id.js';

const supabase = getSupabaseServiceClient();

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
  otherUser: {
    id: string;
    name: string;
    email: string;
  };
}

/**
 * Resolve recipient IDs from either:
 * - users.id (preferred, documented API contract)
 * - freelancer_profiles.id / employer_profiles.id (compat fallback)
 */
async function resolveReceiverUserId(receiverId: string): Promise<string | null> {
  const { data: user, error: userLookupError } = await supabase
    .from('users')
    .select('id')
    .eq('id', receiverId)
    .maybeSingle();

  if (userLookupError) {
    logger.error('Failed receiver lookup in users table', { receiverId, error: userLookupError });
    return null;
  }

  if (user?.id) {
    return user.id;
  }

  // Backward-compatibility path: support profile IDs by mapping to user_id
  for (const profileTable of ['freelancer_profiles', 'employer_profiles'] as const) {
    const { data: profile, error: profileLookupError } = await supabase
      .from(profileTable)
      .select('user_id')
      .eq('id', receiverId)
      .maybeSingle();

    if (profileLookupError) {
      logger.error('Failed receiver lookup in profile table', {
        receiverId,
        profileTable,
        error: profileLookupError,
      });
      continue;
    }

    if (profile?.user_id) {
      return profile.user_id;
    }
  }

  return null;
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

    const resolvedReceiverId = await resolveReceiverUserId(receiverId);
    if (!resolvedReceiverId) {
      return {
        success: false,
        error: {
          code: 'RECEIVER_NOT_FOUND',
          message: 'Unable to resolve receiver user. This contract/conversation has inconsistent participant data.',
        },
      };
    }

    // Find or create conversation
    let conversation = await messageRepository.findConversation(senderId, resolvedReceiverId);
    
    if (!conversation) {
      conversation = await messageRepository.createConversation(senderId, resolvedReceiverId);
    }

    // Create message
    const message = await messageRepository.createMessage({
      conversation_id: conversation.id,
      sender_id: senderId,
      receiver_id: resolvedReceiverId,
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

    // Push real-time message event to the receiver only via SSE.
    // The sender already has the message from the API response, so we do NOT
    // emit to them here to avoid duplication in their chat UI.
    const now = new Date().toISOString();
    const messageEvent = {
      id: generateId(),
      userId: resolvedReceiverId,
      type: 'message' as const,
      title: 'New message',
      message: content.substring(0, 100),
      data: { message } as Record<string, unknown>,
      isRead: false,
      createdAt: now,
      updatedAt: now,
    };
    notificationEmitter.emitToUser(resolvedReceiverId, messageEvent);

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

    // Enrich with other user details and filter out conversations with missing participants
    const enrichedConversations: ConversationWithDetails[] = [];
    
    for (const conv of items) {
      const otherUserId = conv.participant1_id === userId ? conv.participant2_id : conv.participant1_id;
      
      const { data: otherUser, error: userError } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('id', otherUserId)
        .single();

      // If the other user doesn't exist, this conversation has inconsistent data
      if (userError || !otherUser) {
        logger.warn('Conversation has missing participant, skipping from results', { 
          conversationId: conv.id, 
          missingUserId: otherUserId,
          error: userError 
        });
        
        // Optionally, we could mark this conversation for cleanup
        // For now, we'll just skip it from the results
        continue;
      }

      enrichedConversations.push({
        ...conv,
        otherUser,
      } as ConversationWithDetails);
    }

    return {
      success: true,
      data: {
        items: enrichedConversations,
        total: enrichedConversations.length, // Adjust total to reflect filtered results
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

/**
 * Validate conversation participants and identify orphaned conversations
 * This can be used for cleanup or debugging purposes
 */
export async function validateConversationParticipants(userId: string): Promise<ServiceResult<{
  validConversations: ConversationEntity[];
  orphanedConversations: ConversationEntity[];
}>> {
  try {
    const { items: conversations } = await messageRepository.getUserConversations(userId, 1000, 0);
    const validConversations: ConversationEntity[] = [];
    const orphanedConversations: ConversationEntity[] = [];

    for (const conv of conversations) {
      const participant1Exists = await supabase
        .from('users')
        .select('id')
        .eq('id', conv.participant1_id)
        .single();

      const participant2Exists = await supabase
        .from('users')
        .select('id')
        .eq('id', conv.participant2_id)
        .single();

      if (participant1Exists.error || participant2Exists.error) {
        orphanedConversations.push(conv);
        logger.warn('Found orphaned conversation', {
          conversationId: conv.id,
          participant1Id: conv.participant1_id,
          participant2Id: conv.participant2_id,
          participant1Exists: !participant1Exists.error,
          participant2Exists: !participant2Exists.error,
        });
      } else {
        validConversations.push(conv);
      }
    }

    return {
      success: true,
      data: {
        validConversations,
        orphanedConversations,
      },
    };
  } catch (error) {
    logger.error('Unexpected error in validateConversationParticipants', { error, userId });
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
  }
}
