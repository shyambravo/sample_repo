import path from 'node:path';
import Fastify, { FastifyInstance } from 'fastify';
import corsPlugin from '@fastify/cors';
import multipartPlugin from '@fastify/multipart';
import { registerUploadRoutes } from './routes/upload.routes';
import { registerHealthRoutes } from './routes/health.routes';
import { registerAnalysisRoutes } from './routes/analysis.routes';
import { ensureDirectoryExists } from './utils/fs';
import { logSystem, logApp } from './utils/logger';

export async function buildServer(): Promise<FastifyInstance> {
  logSystem.info('Building Fastify server', 'ServerBuilder');
  
  const server = Fastify({
    logger: false, // Disable built-in logger, use our custom logger
    requestTimeout: 240000,
    connectionTimeout: 240000
  });

  // Global plugins
  logSystem.info('Registering CORS plugin', 'ServerBuilder');
  await server.register(corsPlugin, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  logSystem.info('Registering multipart plugin', 'ServerBuilder', {
    maxFileSize: '200 MB',
  });
  await server.register(multipartPlugin, {
    limits: {
      fileSize: 200 * 1024 * 1024, // 200 MB
    },
  });

  const uploadDir = path.join(process.cwd(), 'uploads');
  logSystem.info('Ensuring upload directory exists', 'ServerBuilder', {
    uploadDir,
  });
  await ensureDirectoryExists(uploadDir);

  // Add request/response logging hooks
  server.addHook('onRequest', async (request) => {
    (request as any).startTime = Date.now();
  });

  server.addHook('onResponse', async (request, reply) => {
    const responseTime = Date.now() - ((request as any).startTime || Date.now());
    logApp.info('Request completed', 'Fastify', {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTimeMs: responseTime,
    });
  });

  server.addHook('onError', async (request, reply, error) => {
    logApp.error('Request error', 'Fastify', error, {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
    });
  });

  // Routes
  logSystem.info('Registering routes', 'ServerBuilder');
  await registerHealthRoutes(server);
  await registerUploadRoutes(server, { uploadDir });
  await registerAnalysisRoutes(server, { uploadDir });

  logSystem.info('Server build completed', 'ServerBuilder');
  return server;
}


