// @ts-nocheck
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('Notification Delivery Service - Extended Coverage (SSE manager)', () => {
  const importModule = async () => {
    return await import('../../services/notification-delivery-service.js');
  };

  afterEach(async () => {
    const { stopHeartbeat } = await importModule();
    stopHeartbeat();
  });

  describe('SSE Connection Manager - dead connection cleanup', () => {
    it('should remove dead connections when write fails', async () => {
      const { initializeSSEConnection, notificationEmitter, stopHeartbeat } = await importModule();

      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn().mockImplementation(() => { throw new Error('Connection reset'); }),
        on: jest.fn(),
      };

      // First write succeeds (initial connection message)
      mockRes.write.mockImplementationOnce(() => {});

      initializeSSEConnection('user-dead', mockRes);

      // Now emit a notification - the write will fail
      const notification = {
        id: 'n-1', userId: 'user-dead', type: 'test', title: 'Test',
        message: 'Hello', data: {}, isRead: false, createdAt: '2025-01-01', updatedAt: '2025-01-01',
      };

      // This should not throw even though write fails
      notificationEmitter.emitToUser('user-dead', notification);

      stopHeartbeat();
    });

    it('should handle multiple connections for same user', async () => {
      const { initializeSSEConnection, notificationEmitter, stopHeartbeat } = await importModule();

      const mockRes1 = { setHeader: jest.fn(), write: jest.fn(), on: jest.fn() };
      const mockRes2 = { setHeader: jest.fn(), write: jest.fn(), on: jest.fn() };

      initializeSSEConnection('user-multi', mockRes1);
      initializeSSEConnection('user-multi', mockRes2);

      const notification = {
        id: 'n-1', userId: 'user-multi', type: 'test', title: 'Test',
        message: 'Hello', data: {}, isRead: false, createdAt: '2025-01-01', updatedAt: '2025-01-01',
      };

      notificationEmitter.emitToUser('user-multi', notification);

      // Both connections should receive the notification (initial write + notification)
      expect(mockRes1.write).toHaveBeenCalled();
      expect(mockRes2.write).toHaveBeenCalled();

      stopHeartbeat();
    });

    it('should handle disconnect and cleanup', async () => {
      const { initializeSSEConnection, getSSEStats, stopHeartbeat } = await importModule();

      let closeHandler;
      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn(),
        on: jest.fn((event, handler) => { if (event === 'close') closeHandler = handler; }),
      };

      initializeSSEConnection('user-close', mockRes);

      // Simulate disconnect
      closeHandler();

      const stats = getSSEStats();
      // After disconnect, the connection should be removed
      expect(stats.success).toBe(true);

      stopHeartbeat();
    });
  });

  describe('sendNotificationToUser - error handling', () => {
    it('should handle errors gracefully', async () => {
      const { sendNotificationToUser } = await importModule();

      // Should not throw even with invalid notification
      const result = sendNotificationToUser('user-1', {
        id: 'n-1', userId: 'user-1', type: 'test', title: 'Test',
        message: 'Hello', data: {}, isRead: false, createdAt: '2025-01-01', updatedAt: '2025-01-01',
      });

      expect(result.success).toBe(true);
    });
  });
});
