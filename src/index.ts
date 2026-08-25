import { createApp } from './app.js';
import { config } from './config/index.js';
import { initializeScheduler, stopScheduler } from './services/scheduler-service.js';
import { stopHeartbeat } from './services/notification-delivery-service.js';
import { logger } from './config/logger.js';
import { redis } from './config/redis.js';

async function main(): Promise<void> {
  // Wait for Redis to be ready before accepting traffic.
  // This prevents the "Stream isn't writeable" race where the rate-limiter
  // fires before ioredis has finished its initial TCP handshake.
  try {
    await redis.connect();
  } catch (err) {
    // connect() rejects if already connected — safe to ignore.
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('already')) {
      logger.error('[redis] connect() warning at startup:', err);
    }
  }

  initializeScheduler();

  const app = await createApp();

  const server = app.listen(config.server.port, () => {
    logger.info(`Server running on port ${config.server.port}`);
    logger.info(`Environment: ${config.server.nodeEnv}`);
    if (config.server.enableApiDocs) {
      logger.info(`API docs available at ${config.server.baseUrl}/api-docs`);
    } else {
      logger.info('API docs disabled (set ENABLE_API_DOCS=true to enable)');
    }
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received. Shutting down gracefully...`);

    stopScheduler();
    stopHeartbeat();

    server.close(() => {
      logger.info('HTTP server closed');
    });

    await redis.quit().catch(() => redis.disconnect());

    const forceTimer = setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
    forceTimer.unref();

    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled promise rejection:', reason);
  if (config.server.nodeEnv === 'production') {
    process.exit(1);
  }
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

main().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});