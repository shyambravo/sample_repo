import { FastifyReply, FastifyRequest } from 'fastify';
import { saveMultipartFileToUploads } from '../utils/upload';
import { AnalysisService } from '../services/analysisService';

export function createAnalyzeHandler(deps: { uploadDir: string; analysis: AnalysisService }) {
  return async function analyzeHandler(request: FastifyRequest, reply: FastifyReply) {
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
      return reply
        .code(400)
        .send({ message: 'Missing image file. Send multipart/form-data with an "image" field.' });
    }

    if (!kpiFile) {
      return reply
        .code(400)
        .send({ message: 'Missing KPI file. Send multipart/form-data with a "kpi" field.' });
    }

    // Save the image file
    const savedImage = await saveMultipartFileToUploads(imageFile, deps.uploadDir);
    
    // Read KPI CSV content
    const kpiBuffer = await kpiFile.toBuffer();
    const kpiContent = kpiBuffer.toString('utf-8');

    const result = await deps.analysis.analyze({
      imagePath: savedImage.savedPath,
      kpi: kpiContent,
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


