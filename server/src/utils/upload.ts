import path from 'node:path';
import { promises as fs } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { MultipartFile } from '@fastify/multipart';
import { ensureDirectoryExists } from './fs';

function sanitizeFilename(name: string): string {
  const base = path.basename(name);
  return base.replace(/[^\w.\-]+/g, '_');
}

function generateFallbackName(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `upload_${Date.now()}_${rand}.bin`;
}

async function findAvailablePath(dir: string, filename: string): Promise<string> {
  let candidate = path.join(dir, filename);
  let counter = 1;
  while (true) {
    try {
      await fs.access(candidate);
      const parsed = path.parse(filename);
      const nextName = `${parsed.name}_${counter}${parsed.ext}`;
      candidate = path.join(dir, nextName);
      counter += 1;
    } catch {
      return candidate;
    }
  }
}

export async function saveMultipartFileToUploads(
  file: MultipartFile,
  uploadDir: string,
): Promise<{ filename: string; savedPath: string; sizeBytes: number; mimeType: string }> {
  await ensureDirectoryExists(uploadDir);
  const provided = file.filename ? sanitizeFilename(file.filename) : generateFallbackName();
  const targetPath = await findAvailablePath(uploadDir, provided);
  await pipeline(file.file, await fs.open(targetPath, 'w').then((h) => h.createWriteStream()));
  const stats = await fs.stat(targetPath);
  const filename = path.basename(targetPath);
  return {
    filename,
    savedPath: targetPath,
    sizeBytes: stats.size,
    mimeType: file.mimetype,
  };
}


