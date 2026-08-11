import { logger } from '../config/logger.js';
import { messageRepository } from '../repositories/message-repository.js';
import { userRepository } from '../repositories/user-repository.js';
import { freelancerProfileRepository } from '../repositories/freelancer-profile-repository.js';
import { employerProfileRepository } from '../repositories/employer-profile-repository.js';
import { MessageEntity, ConversationEntity, SendMessageInput } from '../models/message.js';
import { notificationEmitter } from './notification-delivery-service.js';
import { sendGatedEmail, sendMessageReceivedEmail } from './email-delivery-service.js';
import { generateId } from '../utils/id.js';
import type { ServiceResult } from '../types/service-result.js';
import { errorResult, successResult } from '../types/service-result.js';
import type { PaginatedResult } from '../repositories/types.js';

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
  try {
    // Check if receiverId exists in users table
    const user = await userRepository.getUserById(receiverId);

    if (user) {
      return user.id;
    }

    // Backward-compatibility path: support profile IDs by mapping to user_id
    const freelancerProfile = await freelancerProfileRepository.getById(receiverId);
    if (freelancerProfile) {
      return freelancerProfile.user_id;
    }

    const employerProfile = await employerProfileRepository.getById(receiverId);
    if (employerProfile) {
      return employerProfile.user_id;
    }

    return null;
  } catch (error) {
    logger.error('Failed receiver lookup', { receiverId, error });
    return null;
  }
}

/**
 * Send a message to another user
 */
export async function sendMessage(data: SendMessageInput): Promise<ServiceResult<MessageEntity>> {
  try {
    const { senderId, receiverId, content, attachments } = data;

    // Validate input
    if (!content || content.trim().length === 0) {
      return errorResult('VALIDATION_ERROR', 'Message content is required');
    }

    const resolvedReceiverId = await resolveReceiverUserId(receiverId);
    if (!resolvedReceiverId) {
      return errorResult('RECEIVER_NOT_FOUND', 'Unable to resolve receiver user. This contract/conversation has inconsistent participant data.');
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

    // Transactional email gated by the receiver's email preferences. Best-effort:
    // a failure to look up the sender or send the email never breaks the message.
    try {
      const sender = await userRepository.getUserById(senderId);
      await sendGatedEmail(resolvedReceiverId, 'message_received', (recipient) =>
        sendMessageReceivedEmail(recipient.email, {
          recipientName: recipient.name,
          senderName: sender?.name || 'Someone',
          messagePreview: content.substring(0, 100),
          conversationUrl: `${process.env['FRONTEND_URL'] || 'http://localhost:3000'}/messages/${conversation.id}`,
        })
      );
    } catch (error) {
      logger.error('Failed to send message-received email', { error, senderId, receiverId: resolvedReceiverId });
    }

    logger.debug('Message sent successfully', { messageId: message.id, conversationId: conversation.id });

    return successResult(message);
  } catch (error) {
    logger.error('Unexpected error in sendMessage', { error, data });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
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

    const { items, total: _total } = await messageRepository.getUserConversations(userId, limit, offset);

    // Enrich with other user details and filter out conversations with missing participants
    const enrichedResults = await Promise.all(
      items.map(async (conv) => {
        const otherUserId = conv.participant1_id === userId ? conv.participant2_id : conv.participant1_id;

        try {
          const otherUser = await userRepository.getUserById(otherUserId);

          if (!otherUser) {
            logger.warn('Conversation has missing participant, skipping from results', {
              conversationId: conv.id,
              missingUserId: otherUserId
            });
            return null;
          }

          return {
            ...conv,
            otherUser: {
              id: otherUser.id,
              name: otherUser.name,
              email: otherUser.email,
            },
          } as ConversationWithDetails;
        } catch (error) {
          logger.error('Error fetching user details for conversation', {
            conversationId: conv.id,
            otherUserId,
            error
          });
          return null;
        }
      })
    );
    const enrichedConversations: ConversationWithDetails[] = enrichedResults.filter((c): c is ConversationWithDetails => c !== null);

    return successResult({
      items: enrichedConversations,
      total: enrichedConversations.length,
      hasMore: enrichedConversations.length === limit,
    });
      } catch (error) {
      logger.error('Unexpected error in getConversations', { error, userId, options });
      return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
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
    // Verify user is participant via messageRepository
    const _conversation = await messageRepository.findConversation(
      userId,
      // We need the other participant; findConversation requires both IDs
      // Instead, use getUserConversations to find this conversation
      '' // placeholder
    );

    // Alternative: fetch all conversations and find this one
    const { items: userConversations } = await messageRepository.getUserConversations(userId, 1000, 0);
    const conv = userConversations.find(c => c.id === conversationId);

    if (!conv) {
      return errorResult('CONVERSATION_NOT_FOUND', 'Conversation not found');
    }

    if (conv.participant1_id !== userId && conv.participant2_id !== userId) {
      return errorResult('UNAUTHORIZED', 'You are not a participant in this conversation');
    }

    const page = options.page || 1;
    const limit = options.limit || 50;
    const offset = (page - 1) * limit;

    const { items, total } = await messageRepository.getConversationMessages(conversationId, limit, offset);

    return successResult({
      items,
      total,
      hasMore: offset + limit < total,
    });
      } catch (error) {
      logger.error('Unexpected error in getConversationMessages', { error, conversationId, userId, options });
      return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
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
    const { items: userConversations } = await messageRepository.getUserConversations(userId, 1000, 0);
    const conv = userConversations.find(c => c.id === conversationId);

    if (!conv) {
      return errorResult('CONVERSATION_NOT_FOUND', 'Conversation not found');
    }

    if (conv.participant1_id !== userId && conv.participant2_id !== userId) {
      return errorResult('UNAUTHORIZED', 'You are not a participant in this conversation');
    }

    // Mark messages as read
    await messageRepository.markMessagesAsRead(conversationId, userId);

    // Reset unread count
    const isParticipant1 = conv.participant1_id === userId;
    const updates = isParticipant1
      ? { unread_count_1: 0 }
      : { unread_count_2: 0 };

    await messageRepository.updateConversation(conversationId, updates);

    return successResult(undefined as unknown as void);
  } catch (error) {
    logger.error('Unexpected error in markConversationAsRead', { error, conversationId, userId });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Get unread message count for user
 */
export async function getUnreadMessageCount(userId: string): Promise<ServiceResult<number>> {
  try {
    const count = await messageRepository.getUnreadCount(userId);

    return successResult(count);
  } catch (error) {
    logger.error('Unexpected error in getUnreadMessageCount', { error, userId });
    return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Validate that all participants in user's conversations still exist
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

    const validationResults = await Promise.all(
      conversations.map(async (conv) => {
        const [participant1, participant2] = await Promise.all([
          userRepository.getUserById(conv.participant1_id),
          userRepository.getUserById(conv.participant2_id),
        ]);

        const participant1Exists = !!participant1;
        const participant2Exists = !!participant2;

        if (!participant1Exists || !participant2Exists) {
          logger.warn('Found orphaned conversation', {
            conversationId: conv.id,
            participant1Id: conv.participant1_id,
            participant2Id: conv.participant2_id,
            participant1Exists,
            participant2Exists,
          });
          return { conv, orphaned: true };
        }
        return { conv, orphaned: false };
      })
    );

    for (const { conv, orphaned } of validationResults) {
      if (orphaned) {
        orphanedConversations.push(conv);
      } else {
        validConversations.push(conv);
      }
    }

    return successResult({
      validConversations,
      orphanedConversations,
    });
      } catch (error) {
      logger.error('Unexpected error in validateConversationParticipants', { error, userId });
      return errorResult('INTERNAL_ERROR', 'An unexpected error occurred');
    }
}
