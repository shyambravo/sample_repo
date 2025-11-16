import { FastifyInstance } from 'fastify';

export async function registerDebugRoutes(server: FastifyInstance): Promise<void> {
  server.post('/debug/test-litellm', async (request, reply) => {
    const litellmBaseUrl = process.env.LITELLM_BASE_URL;
    const litellmApiKey = process.env.LITELLM_API_KEY;

    if (!litellmBaseUrl || !litellmApiKey) {
      return reply.code(400).send({ error: 'LiteLLM not configured' });
    }

    const testPayload = {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: 'Test message from debug endpoint',
        },
      ],
    };

    try {
      const response = await fetch(`${litellmBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${litellmApiKey}`,
        },
        body: JSON.stringify(testPayload),
      });

      const data = await response.json();
      return reply.code(response.status).send(data);
    } catch (error) {
      return reply.code(500).send({ error: String(error) });
    }
  });
}


