import { FastifyReply, FastifyRequest } from 'fastify';
import { saveMultipartFileToUploads } from '../utils/upload';

export function createUploadImageHandler(uploadDir: string) {
  return async function uploadImageHandler(request: FastifyRequest, reply: FastifyReply) {
    const part = await request.file();
    if (!part) {
      return reply.code(400).send({ message: 'Missing file. Send multipart/form-data with a file field.' });
    }
    const saved = await saveMultipartFileToUploads(part, uploadDir);
    return reply.code(201).send({
      filename: saved.filename,
      urlPath: `/uploads/${encodeURIComponent(saved.filename)}`,
      sizeBytes: saved.sizeBytes,
      mimeType: saved.mimeType,
    });
  };
}


