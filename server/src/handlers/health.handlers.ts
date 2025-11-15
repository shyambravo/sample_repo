import { FastifyReply, FastifyRequest } from 'fastify';
import { HealthService } from '../services/healthService';

export function createHealthHandler(healthService: HealthService) {
  return async function healthHandler(_req: FastifyRequest, reply: FastifyReply) {
    return reply.send(healthService.status());
  };
}


