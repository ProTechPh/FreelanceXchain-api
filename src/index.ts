import { createApp } from './app.js';
import { config, initializeDatabase } from './config/index.js';

async function main(): Promise<void> {
  const app = createApp();

  // Initialize database if Cosmos DB is configured
  if (config.cosmos.endpoint && config.cosmos.key) {
    try {
      console.log('Initializing database...');
      await initializeDatabase();
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      // Continue without database in development mode
      if (config.server.nodeEnv === 'production') {
        process.exit(1);
      }
    }
  } else {
    console.log('Cosmos DB not configured, skipping database initialization');
  }

  const server = app.listen(config.server.port, () => {
    console.log(`Server running on port ${config.server.port}`);
    console.log(`Environment: ${config.server.nodeEnv}`);
    console.log(`API docs available at http://localhost:${config.server.port}/api-docs`);
  });

  // Graceful shutdown handling
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
