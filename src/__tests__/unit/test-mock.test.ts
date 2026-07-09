// @ts-nocheck
import { jest, describe, it, expect } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockNotificationRepo = {
  getNotificationsByUser: jest.fn(),
};
jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({
  notificationRepository: mockNotificationRepo,
  NotificationEntity: {},
}));

describe('Mock Test', () => {
  it('should use mocked notification repo', async () => {
    mockNotificationRepo.getNotificationsByUser.mockResolvedValue({
      items: [{ $id: 'n1', user_id: 'u1', type: 'info', title: 'Test', message: 'Hello', read: false, $createdAt: '2025-01-01' }],
      total: 1,
      hasMore: false,
    });
    const { getNotificationsByUser } = await import(resolveModule('src/services/notification-service.ts'));
    const result = await getNotificationsByUser('u1', { limit: 10, offset: 0 });
    console.log('Result:', JSON.stringify(result));
    expect(result.success).toBe(true);
  });
});
