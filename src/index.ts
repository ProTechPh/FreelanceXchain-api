import { createApp } from './app.js';
import { config, initializeDatabase } from './config/index.js';

async function main(): Promise<void> {
  const app = await createApp();

  // Initialize database if Supabase is configured
  if (config.supabase.url && config.supabase.anonKey) {
    try {
      console.log('Initializing Supabase connection...');
      await initializeDatabase();
      console.log('Supabase connection verified');
    } catch (error) {
      console.error('Failed to connect to Supabase:', error);
      // Continue without database in development mode
      if (config.server.nodeEnv === 'production') {
        process.exit(1);
      }
    }
  } else {
    console.log('Supabase not configured, skipping database initialization');
  }

  const server = app.listen(config.server.port, () => {
    console.log(`Server running on port ${config.server.port}`);
    console.log(`Environment: ${config.server.nodeEnv}`);
    if (config.server.enableApiDocs) {
      console.log(`API docs available at ${config.server.baseUrl}/api-docs`);
    } else {
      console.log('API docs disabled (set ENABLE_API_DOCS=true to enable)');
    }
  });

  // Graceful shutdown handling
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });

    // Force close after 10 seconds (unref so it doesn't keep the event loop alive)
    const forceTimer = setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
    forceTimer.unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Handle unhandled promise rejections — prevents silent crashes
process.on('unhandledRejection', (reason: unknown) => {
  console.error('Unhandled promise rejection:', reason);
  // In production, exit to let the process manager restart
  if (process.env['NODE_ENV'] === 'production') {
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
