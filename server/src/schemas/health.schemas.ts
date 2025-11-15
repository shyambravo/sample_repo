export const healthResponseSchema = {
  200: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string' },
    },
  },
} as const;


