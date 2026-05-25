// @ts-nocheck
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import path from 'node:path';

const resolveModule = (modulePath: string) => path.resolve(process.cwd(), modulePath);

const mockGetUnreadNotificationsByUser = jest.fn<any>();
const mockGetNotificationsByUser = jest.fn<any>();
const mockGetAllNotificationsByUser = jest.fn<any>();
const mockGetNotificationById = jest.fn<any>();
const mockCreateNotification = jest.fn<any>();
const mockMarkAsRead = jest.fn<any>();
const mockMarkAllAsRead = jest.fn<any>();
const mockGetUnreadCount = jest.fn<any>();

jest.unstable_mockModule(resolveModule('src/repositories/notification-repository.ts'), () => ({
  notificationRepository: {
    getUnreadNotificationsByUser: mockGetUnreadNotificationsByUser,
    getNotificationsByUser: mockGetNotificationsByUser,
    getAllNotificationsByUser: mockGetAllNotificationsByUser,
    getNotificationById: mockGetNotificationById,
    createNotification: mockCreateNotification,
    markAsRead: mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
    getUnreadCount: mockGetUnreadCount,
  },
}));

jest.unstable_mockModule(resolveModule('src/utils/entity-mapper.ts'), () => ({
  mapNotificationFromEntity: (entity: any) => ({
    id: entity.id,
    userId: entity.user_id,
    type: entity.type,
    title: entity.title,
    message: entity.message,
    data: entity.data,
    isRead: entity.is_read,
    createdAt: entity.created_at,
    updatedAt: entity.updated_at,
  }),
}));

jest.unstable_mockModule(resolveModule('src/utils/id.ts'), () => ({
  generateId: () => 'generated-id',
}));

jest.unstable_mockModule(resolveModule('src/repositories/base-repository-pg.ts'), () => ({}));

const { getUnreadNotificationsByUser } = await import('../../services/notification-service.js');

describe('Notification Service - getUnreadNotificationsByUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return mapped unread notifications for a user', async () => {
    const mockEntities = [
      {
        id: 'notif-1',
        user_id: 'user-1',
        type: 'proposal_received',
        title: 'New Proposal',
        message: 'You have a new proposal',
        data: { proposalId: 'p-1' },
        is_read: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
      {
        id: 'notif-2',
        user_id: 'user-1',
        type: 'milestone_submitted',
        title: 'Milestone Submitted',
        message: 'A milestone was submitted',
        data: { milestoneId: 'm-1' },
        is_read: false,
        created_at: '2024-01-02T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      },
    ];

    mockGetUnreadNotificationsByUser.mockResolvedValue(mockEntities);

    const result = await getUnreadNotificationsByUser('user-1');

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toEqual({
      id: 'notif-1',
      userId: 'user-1',
      type: 'proposal_received',
      title: 'New Proposal',
      message: 'You have a new proposal',
      data: { proposalId: 'p-1' },
      isRead: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    });
    expect(result.data[1].id).toBe('notif-2');
    expect(mockGetUnreadNotificationsByUser).toHaveBeenCalledWith('user-1');
  });

  it('should return empty array when user has no unread notifications', async () => {
    mockGetUnreadNotificationsByUser.mockResolvedValue([]);

    const result = await getUnreadNotificationsByUser('user-1');

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(0);
  });
});
