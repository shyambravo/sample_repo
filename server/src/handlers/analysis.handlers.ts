import { FastifyReply, FastifyRequest } from 'fastify';
import { saveMultipartFileToUploads } from '../utils/upload';
import { AnalysisService } from '../services/analysisService';
import { logApp } from '../utils/logger';

export function createAnalyzeHandler(deps: { uploadDir: string; analysis: AnalysisService }) {
  return async function analyzeHandler(request: FastifyRequest, reply: FastifyReply) {
    const requestId = Math.random().toString(36).substring(7);
    
    logApp.info('POST /analysis request received', 'AnalyzeHandler', {
      requestId,
      contentType: request.headers['content-type'],
      ip: request.ip,
    });
    
    let imageFile: Awaited<ReturnType<typeof request.file>> | null = null;
    let kpiFile: Awaited<ReturnType<typeof request.file>> | null = null;

    // Read all parts to get both files
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (part.fieldname === 'image') {
          imageFile = part;
        } else if (part.fieldname === 'kpi') {
          kpiFile = part;
        }
      }
    }

    if (!imageFile) {
      logApp.warning('Missing image file in request', 'AnalyzeHandler', { requestId });
      return reply
        .code(400)
        .send({ message: 'Missing image file. Send multipart/form-data with an "image" field.' });
    }

    if (!kpiFile) {
      logApp.warning('Missing KPI file in request', 'AnalyzeHandler', { requestId });
      return reply
        .code(400)
        .send({ message: 'Missing KPI file. Send multipart/form-data with a "kpi" field.' });
    }

    // Save the image file
    const savedImage = await saveMultipartFileToUploads(imageFile, deps.uploadDir);
    logApp.info('Image saved successfully', 'AnalyzeHandler', {
      requestId,
      filename: savedImage.filename,
      sizeBytes: savedImage.sizeBytes,
      mimeType: savedImage.mimeType,
    });
    
    // Read KPI CSV content
    const kpiBuffer = await kpiFile.toBuffer();
    const kpiContent = kpiBuffer.toString('utf-8');

    logApp.info('Invoking analysis service', 'AnalyzeHandler', { requestId });
    
    const result = await deps.analysis.analyze({
      imagePath: savedImage.savedPath,
      kpi: kpiContent,
    });
    
    logApp.info('Analysis completed, sending response', 'AnalyzeHandler', {
      requestId,
      providerCount: result.providerSummaries.length,
    });
    
    return reply.code(200).send({
      ...result,
      uploaded: {
        filename: savedImage.filename,
        sizeBytes: savedImage.sizeBytes,
        mimeType: savedImage.mimeType,
      },
    });
  };
}


