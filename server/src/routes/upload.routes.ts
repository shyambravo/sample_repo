import { FastifyInstance } from 'fastify';
import { uploadResponseSchema } from '../schemas/upload.schemas';
import { createUploadImageHandler } from '../handlers/upload.handlers';

export async function registerUploadRoutes(server: FastifyInstance, deps: { uploadDir: string }): Promise<void> {
  server.route({
    method: 'POST',
    url: '/upload',
    schema: {
      response: uploadResponseSchema,
    },
    handler: createUploadImageHandler(deps.uploadDir),
  });
}


