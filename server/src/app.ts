import path from 'node:path';
import Fastify, { FastifyInstance } from 'fastify';
import corsPlugin from '@fastify/cors';
import multipartPlugin from '@fastify/multipart';
import { registerUploadRoutes } from './routes/upload.routes';
import { registerHealthRoutes } from './routes/health.routes';
import { ensureDirectoryExists } from './utils/fs';

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: true,
  });

  // Global plugins
  await server.register(corsPlugin, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await server.register(multipartPlugin, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB
    },
  });

  const uploadDir = path.join(process.cwd(), 'uploads');
  await ensureDirectoryExists(uploadDir);

  // Routes
  await registerHealthRoutes(server);
  await registerUploadRoutes(server, { uploadDir });

  return server;
}


