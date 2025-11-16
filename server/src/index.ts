import 'dotenv/config';
import { buildServer } from './app';

async function start() {
  const server = await buildServer();
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';

  try {
    await server.listen({ port, host });
    // eslint-disable-next-line no-console
    console.log(`Server listening on http://${host}:${port}`);
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
}

void start();


