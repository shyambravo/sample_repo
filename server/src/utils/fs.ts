import { promises as fs } from 'node:fs';

export async function ensureDirectoryExists(directoryPath: string): Promise<void> {
  try {
    await fs.mkdir(directoryPath, { recursive: true });
  } catch {
    // swallow if already exists or cannot be created
  }
}


