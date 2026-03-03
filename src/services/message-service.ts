import { MessageRepository, MessageEntity, CreateMessageInput } from '../repositories/message-repository.js';
import { contractRepository } from '../repositories/contract-repository.js';
import { createNotification } from './notification-service.js';
import { PaginatedResult, QueryOptions } from '../repositories/base-repository.js';

export type SendMessageInput = {
  contractId: string;
  senderId: string;
  content: string;
};

export type ConversationSummary = {
  contractId: string;
  lastMessage: MessageEntity | null;
  unreadCount: number;
};

async function ensureContractParticipant(contractId: string, userId: string) {
  const contract = await contractRepository.getContractById(contractId);
  if (!contract) {
    throw new Error('Contract not found');
  }

  const isParticipant = contract.freelancer_id === userId || contract.employer_id === userId;
  if (!isParticipant) {
    throw new Error('User is not part of this contract');
  }

  return contract;
}

async function sendMessage(input: SendMessageInput): Promise<MessageEntity> {
  const { contractId, senderId, content } = input;

  // Verify contract exists and user is part of it
  const contract = await ensureContractParticipant(contractId, senderId);

  // FIXED: Only allow messaging on active or disputed contracts
  const messagingAllowedStatuses = ['active', 'disputed'];
  if (!messagingAllowedStatuses.includes(contract.status)) {
    throw new Error('Messages can only be sent on active or disputed contracts');
  }

  const messageData: CreateMessageInput = {
    contract_id: contractId,
    sender_id: senderId,
    content,
  };

  const message = await MessageRepository.create({ ...messageData, id: crypto.randomUUID(), is_read: false });

  // Notify the other party
  const recipientId = contract.freelancer_id === senderId ? contract.employer_id : contract.freelancer_id;
  await createNotification({
    userId: recipientId,
    type: 'message',
    title: 'New Message',
    message: content.length > 100 ? content.substring(0, 100) + '...' : content,
    data: { contractId, messageId: message.id },
  });

  return message;
}

async function getMessages(contractId: string, userId: string, options?: QueryOptions): Promise<PaginatedResult<MessageEntity>> {
  await ensureContractParticipant(contractId, userId);

  return MessageRepository.findByContractId(contractId, options);
}

async function markAsRead(contractId: string, userId: string): Promise<void> {
  await ensureContractParticipant(contractId, userId);

  await MessageRepository.markAsRead(contractId, userId);
}

async function getUnreadCount(contractId: string, userId: string): Promise<number> {
  await ensureContractParticipant(contractId, userId);
  return MessageRepository.getUnreadCount(contractId, userId);
}

async function getConversationSummary(contractId: string, userId: string): Promise<ConversationSummary> {
  await ensureContractParticipant(contractId, userId);

  const [lastMessage, unreadCount] = await Promise.all([
    MessageRepository.getLatestMessage(contractId),
    MessageRepository.getUnreadCount(contractId, userId),
  ]);

  return { contractId, lastMessage, unreadCount };
}

export const MessageService = {
  sendMessage,
  getMessages,
  markAsRead,
  getUnreadCount,
  getConversationSummary,
};
