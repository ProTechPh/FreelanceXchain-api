import { EventEmitter } from 'events';
import type { Response } from 'express';
import { logger } from '../config/logger.js';
import type { Notification } from '../models/notification.js';

export type ServiceResult<T> = 
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

/**
 * Event emitter for real-time notifications
 */
class NotificationEmitter extends EventEmitter {
  /**
   * Emit notification to specific user
   */
  emitToUser(userId: string, notification: Notification): void {
    this.emit(`user:${userId}`, notification);
    logger.info(`Notification emitted to user ${userId}`, { notificationId: notification.id });
  }

  /**
   * Subscribe to user notifications
   */
  subscribeToUser(userId: string, callback: (notification: Notification) => void): () => void {
    this.on(`user:${userId}`, callback);
    
    // Return unsubscribe function
    return () => {
      this.off(`user:${userId}`, callback);
    };
  }
}

export const notificationEmitter = new NotificationEmitter();

/**
 * SSE connection manager
 */
class SSEConnectionManager {
  private connections: Map<string, Set<Response>> = new Map();

  /**
   * Add SSE connection for user
   */
  addConnection(userId: string, res: Response): void {
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set());
    }
    
    this.connections.get(userId)?.add(res);
    logger.info(`SSE connection added for user ${userId}`, { 
      totalConnections: this.connections.get(userId)?.size 
    });
  }

  /**
   * Remove SSE connection
   */
  removeConnection(userId: string, res: Response): void {
    const userConnections = this.connections.get(userId);
    if (userConnections) {
      userConnections.delete(res);
      
      if (userConnections.size === 0) {
        this.connections.delete(userId);
      }
      
      logger.info(`SSE connection removed for user ${userId}`, { 
        remainingConnections: userConnections.size 
      });
    }
  }

  /**
   * Send notification to all user connections
   */
  sendToUser(userId: string, notification: Notification): void {
    const userConnections = this.connections.get(userId);
    
    if (!userConnections || userConnections.size === 0) {
      logger.debug(`No active SSE connections for user ${userId}`);
      return;
    }

    const data = JSON.stringify(notification);
    const deadConnections: Response[] = [];

    userConnections.forEach(res => {
      try {
        res.write(`data: ${data}\n\n`);
      } catch (error) {
        logger.error('Failed to send SSE notification:', error);
        deadConnections.push(res);
      }
    });

    // Clean up dead connections
    deadConnections.forEach(res => {
      this.removeConnection(userId, res);
    });
  }

  /**
   * Get connection count for user
   */
  getConnectionCount(userId: string): number {
    return this.connections.get(userId)?.size || 0;
  }

  /**
   * Get total connection count
   */
  getTotalConnections(): number {
    let total = 0;
    this.connections.forEach(connections => {
      total += connections.size;
    });
    return total;
  }

  /**
   * Send heartbeat to all connections
   */
  sendHeartbeat(): void {
    this.connections.forEach((connections, userId) => {
      connections.forEach(res => {
        try {
          res.write(': heartbeat\n\n');
        } catch (error) {
          logger.error(`Heartbeat failed for user ${userId}:`, error);
        }
      });
    });
  }
}

export const sseConnectionManager = new SSEConnectionManager();

/**
 * Initialize SSE connection for user
 */
export function initializeSSEConnection(userId: string, res: Response): ServiceResult<void> {
  try {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

    // Add connection to manager
    sseConnectionManager.addConnection(userId, res);

    // Subscribe to notification events
    const unsubscribe = notificationEmitter.subscribeToUser(userId, (notification) => {
      sseConnectionManager.sendToUser(userId, notification);
    });

    // Handle client disconnect
    res.on('close', () => {
      unsubscribe();
      sseConnectionManager.removeConnection(userId, res);
      logger.info(`SSE connection closed for user ${userId}`);
    });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error('Failed to initialize SSE connection:', error);
    return {
      success: false,
      error: {
        code: 'SSE_INIT_FAILED',
        message: error instanceof Error ? error.message : 'Failed to initialize SSE connection',
      },
    };
  }
}

/**
 * Send notification to user via SSE
 */
export function sendNotificationToUser(userId: string, notification: Notification): ServiceResult<void> {
  try {
    // Emit to event emitter (for SSE connections)
    notificationEmitter.emitToUser(userId, notification);

    return { success: true, data: undefined };
  } catch (error) {
    logger.error('Failed to send notification:', error);
    return {
      success: false,
      error: {
        code: 'NOTIFICATION_SEND_FAILED',
        message: error instanceof Error ? error.message : 'Failed to send notification',
      },
    };
  }
}

/**
 * Get SSE connection stats
 */
export function getSSEStats(): ServiceResult<{
  totalConnections: number;
  activeUsers: number;
}> {
  try {
    const totalConnections = sseConnectionManager.getTotalConnections();
    const activeUsers = Array.from(sseConnectionManager['connections'].keys()).length;

    return {
      success: true,
      data: {
        totalConnections,
        activeUsers,
      },
    };
  } catch (error) {
    logger.error('Failed to get SSE stats:', error);
    return {
      success: false,
      error: {
        code: 'SSE_STATS_FAILED',
        message: error instanceof Error ? error.message : 'Failed to get SSE stats',
      },
    };
  }
}

/**
 * Start heartbeat interval to keep connections alive
 */
export function startHeartbeat(intervalMs: number = 30000): NodeJS.Timeout {
  logger.info(`Starting SSE heartbeat with interval ${intervalMs}ms`);
  
  return setInterval(() => {
    sseConnectionManager.sendHeartbeat();
  }, intervalMs);
}
