export const analysisResponseSchema = {
  200: {
    type: 'object',
    required: ['mergedReport', 'providerSummaries'],
    properties: {
      mergedReport: { type: 'string' },
      providerSummaries: {
        type: 'array',
        items: {
          type: 'object',
          required: ['provider', 'content'],
          properties: {
            provider: { type: 'string', enum: ['adk'] },
            model: { type: 'string', nullable: true },
            content: { type: 'string' },
          },
        },
      },
      uploaded: {
        type: 'object',
        nullable: true,
        properties: {
          filename: { type: 'string' },
          sizeBytes: { type: 'number' },
          mimeType: { type: 'string' },
        },
      },
    },
  },
} as const;


