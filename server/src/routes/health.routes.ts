import { FastifyInstance } from 'fastify';
import { HealthService } from '../services/healthService';
import { createHealthHandler } from '../handlers/health.handlers';
import { healthResponseSchema } from '../schemas/health.schemas';

export async function registerHealthRoutes(server: FastifyInstance): Promise<void> {
  const healthService = new HealthService();
  server.route({
    method: 'GET',
    url: '/health',
    schema: {
      response: healthResponseSchema,
    },
    handler: createHealthHandler(healthService),
  });
}


