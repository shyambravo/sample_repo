import 'dotenv/config';
import { buildServer } from './app';
import { logSystem } from './utils/logger';

async function start() {
  logSystem.info('Starting warehouse simulator server', 'Bootstrap', {
    nodeVersion: process.version,
    platform: process.platform,
    env: process.env.NODE_ENV || 'development',
  });

  const server = await buildServer();
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';

  try {
    await server.listen({ port, host });
    logSystem.info('Server started successfully', 'Bootstrap', {
      host,
      port,
      url: `http://${host}:${port}`,
    });
  } catch (error) {
    logSystem.error('Failed to start server', 'Bootstrap', error);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logSystem.info(`Received ${signal}, shutting down gracefully`, 'Bootstrap');
    try {
      await server.close();
      logSystem.info('Server closed successfully', 'Bootstrap');
      process.exit(0);
    } catch (error) {
      logSystem.error('Error during shutdown', 'Bootstrap', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void start();


