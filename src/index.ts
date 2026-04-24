import { createApp } from './app.js';
import { config, initializeDatabase } from './config/index.js';
import { stopScheduler } from './services/scheduler-service.js';
import { stopHeartbeat } from './services/notification-delivery-service.js';
import { logger } from './config/logger.js';

async function main(): Promise<void> {
  const app = await createApp();

  if (config.supabase.url && config.supabase.anonKey) {
    try {
      logger.info('Initializing Supabase connection...');
      await initializeDatabase();
      logger.info('Supabase connection verified');
    } catch (error) {
      logger.error('Failed to connect to Supabase:', error);
      if (config.server.nodeEnv === 'production') {
        process.exit(1);
      }
    }
  } else {
    logger.info('Supabase not configured, skipping database initialization');
  }

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
      process.exit(0);
    });

    const forceTimer = setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
    forceTimer.unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled promise rejection:', reason);
  if (process.env['NODE_ENV'] === 'production') {
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