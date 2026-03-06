/**
 * Mock Service Factory
 * Provides reusable mock service implementations for testing
 */

import { jest } from '@jest/globals';

/**
 * Create a mock auth service
 */
export function createMockAuthService() {
  return {
    register: jest.fn<any>(),
    login: jest.fn<any>(),
    refreshTokens: jest.fn<any>(),
    logout: jest.fn<any>(),
    validateToken: jest.fn<any>(),
    getCurrentUserWithKyc: jest.fn<any>(),
    enrollMFA: jest.fn<any>(),
    verifyMFAEnrollment: jest.fn<any>(),
    challengeMFA: jest.fn<any>(),
    verifyMFAChallenge: jest.fn<any>(),
    getMFAFactors: jest.fn<any>(),
    disableMFA: jest.fn<any>(),
  };
}

/**
 * Create a mock blockchain service
 */
export function createMockBlockchainService() {
  return {
    deployEscrow: jest.fn<any>().mockResolvedValue({
      escrowAddress: '0x1234567890123456789012345678901234567890',
      transactionHash: '0xabcdef1234567890',
    }),
    releasePayment: jest.fn<any>().mockResolvedValue({
      transactionHash: '0xabcdef1234567890',
      success: true,
    }),
    refund: jest.fn<any>().mockResolvedValue({
      transactionHash: '0xabcdef1234567890',
      success: true,
    }),
    getBalance: jest.fn<any>().mockResolvedValue(BigInt('1000000000000000000')),
    submitRating: jest.fn<any>().mockResolvedValue({
      transactionHash: '0xabcdef1234567890',
      success: true,
    }),
    getReputationScore: jest.fn<any>().mockResolvedValue(85),
  };
}

/**
 * Create a mock notification service
 */
export function createMockNotificationService() {
  const notifications: any[] = [];
  
  return {
    sendNotification: jest.fn<any>().mockResolvedValue(true),
    sendEmail: jest.fn<any>().mockResolvedValue(true),
    createNotification: jest.fn<any>(async (input: any) => {
      const notification = {
        id: 'notification-' + Date.now(),
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        data: input.data || {},
        isRead: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      notifications.push(notification);
      return {
        success: true,
        data: notification,
      };
    }),
    markAsRead: jest.fn<any>(),
    getUnreadCount: jest.fn<any>().mockResolvedValue(0),
    _getNotifications: jest.fn(() => notifications),
    clear: jest.fn(() => {
      notifications.length = 0;
    }),
  };
}

/**
 * Create a mock AI service
 */
export function createMockAIService() {
  return {
    matchFreelancersToProject: jest.fn<any>().mockResolvedValue([]),
    generateProjectDescription: jest.fn<any>().mockResolvedValue('Generated description'),
    analyzeSkillMatch: jest.fn<any>().mockResolvedValue({ score: 0.85, reasons: [] }),
  };
}

/**
 * Create a mock storage service
 */
export function createMockStorageService() {
  return {
    uploadFile: jest.fn<any>().mockResolvedValue({
      url: 'https://example.com/file.pdf',
      path: 'uploads/file.pdf',
    }),
    deleteFile: jest.fn<any>().mockResolvedValue(true),
    getSignedUrl: jest.fn<any>().mockResolvedValue('https://example.com/signed-url'),
  };
}
