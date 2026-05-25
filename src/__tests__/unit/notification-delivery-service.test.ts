// @ts-nocheck
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

jest.unstable_mockModule(resolveModule('src/config/logger.ts'), () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Notification Delivery Service', () => {
  const importModule = async () => {
    return await import('../../services/notification-delivery-service.js');
  };

  describe('notificationEmitter', () => {
    it('should emit and receive notifications for a user', async () => {
      const { notificationEmitter } = await importModule();

      const notification = {
        id: 'notif-1',
        userId: 'user-1',
        type: 'test' as const,
        title: 'Test',
        message: 'Hello',
        data: {},
        isRead: false,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      };

      const callback = jest.fn();
      const unsubscribe = notificationEmitter.subscribeToUser('user-1', callback);

      notificationEmitter.emitToUser('user-1', notification);

      expect(callback).toHaveBeenCalledWith(notification);

      unsubscribe();
      notificationEmitter.emitToUser('user-1', notification);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should not emit to other users', async () => {
      const { notificationEmitter } = await importModule();

      const notification = {
        id: 'notif-1',
        userId: 'user-1',
        type: 'test' as const,
        title: 'Test',
        message: 'Hello',
        data: {},
        isRead: false,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      };

      const callback = jest.fn();
      const unsubscribe = notificationEmitter.subscribeToUser('user-2', callback);

      notificationEmitter.emitToUser('user-1', notification);

      expect(callback).not.toHaveBeenCalled();
      unsubscribe();
    });
  });

  describe('sendNotificationToUser', () => {
    it('should send notification successfully', async () => {
      const { sendNotificationToUser, notificationEmitter } = await importModule();

      const notification = {
        id: 'notif-1',
        userId: 'user-1',
        type: 'test' as const,
        title: 'Test',
        message: 'Hello',
        data: {},
        isRead: false,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      };

      const callback = jest.fn();
      const unsubscribe = notificationEmitter.subscribeToUser('user-1', callback);

      const result = sendNotificationToUser('user-1', notification);

      expect(result.success).toBe(true);
      expect(callback).toHaveBeenCalledWith(notification);
      unsubscribe();
    });
  });

  describe('initializeSSEConnection', () => {
    it('should initialize SSE connection successfully', async () => {
      const { initializeSSEConnection, stopHeartbeat } = await importModule();

      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn(),
        on: jest.fn(),
      } as any;

      const result = initializeSSEConnection('user-1', mockRes);

      expect(result.success).toBe(true);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(mockRes.write).toHaveBeenCalled();
      expect(mockRes.on).toHaveBeenCalledWith('close', expect.any(Function));

      stopHeartbeat();
    });

    it('should handle SSE write for notifications', async () => {
      const { initializeSSEConnection, notificationEmitter, stopHeartbeat } = await importModule();

      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn(),
        on: jest.fn(),
      } as any;

      initializeSSEConnection('user-sse', mockRes);

      const notification = {
        id: 'notif-1',
        userId: 'user-sse',
        type: 'test' as const,
        title: 'Test',
        message: 'Hello',
        data: {},
        isRead: false,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      };

      notificationEmitter.emitToUser('user-sse', notification);

      // The write should have been called for the initial connection + the notification
      expect(mockRes.write).toHaveBeenCalledTimes(2);

      stopHeartbeat();
    });

    it('should handle client disconnect', async () => {
      const { initializeSSEConnection, stopHeartbeat } = await importModule();

      let closeHandler: Function | null = null;
      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn(),
        on: jest.fn((event: string, handler: Function) => {
          if (event === 'close') closeHandler = handler;
        }),
      } as any;

      initializeSSEConnection('user-disconnect', mockRes);

      // Simulate disconnect
      expect(closeHandler).not.toBeNull();
      closeHandler!();

      stopHeartbeat();
    });
  });

  describe('getSSEStats', () => {
    it('should return connection statistics', async () => {
      const { getSSEStats, initializeSSEConnection, stopHeartbeat } = await importModule();

      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn(),
        on: jest.fn(),
      } as any;

      initializeSSEConnection('user-stats', mockRes);

      const result = getSSEStats();

      expect(result.success).toBe(true);
      expect(result.data.totalConnections).toBeGreaterThanOrEqual(1);
      expect(result.data.activeUsers).toBeGreaterThanOrEqual(1);

      stopHeartbeat();
    });
  });

  describe('stopHeartbeat', () => {
    it('should stop heartbeat without error', async () => {
      const { stopHeartbeat } = await importModule();

      // Should not throw
      stopHeartbeat();
      stopHeartbeat(); // Calling twice should be safe
    });
  });
});
