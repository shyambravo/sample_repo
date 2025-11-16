import { FastifyInstance } from 'fastify';
import { analysisResponseSchema } from '../schemas/analysis.schemas';
import { createAnalyzeHandler } from '../handlers/analysis.handlers';
import { AnalysisService } from '../services/analysisService';

export async function registerAnalysisRoutes(
  server: FastifyInstance,
  deps: { uploadDir: string },
): Promise<void> {
  const analysis = new AnalysisService();
  server.route({
    method: 'POST',
    url: '/analysis',
    schema: {
      response: analysisResponseSchema,
    },
    handler: createAnalyzeHandler({ uploadDir: deps.uploadDir, analysis }),
  });
}


