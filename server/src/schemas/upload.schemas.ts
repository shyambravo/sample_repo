export const uploadResponseSchema = {
  201: {
    type: 'object',
    required: ['filename', 'urlPath', 'sizeBytes', 'mimeType'],
    properties: {
      filename: { type: 'string' },
      urlPath: { type: 'string' },
      sizeBytes: { type: 'integer' },
      mimeType: { type: 'string' },
    },
  },
  400: {
    type: 'object',
    required: ['message'],
    properties: {
      message: { type: 'string' },
    },
  },
} as const;


