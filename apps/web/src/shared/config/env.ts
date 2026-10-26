import { z } from 'zod';

const envSchema = z.object({
  VITE_API_URL: z.string().min(1).default('/api'),
  VITE_API_MOCKS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

const parsed = envSchema.parse(import.meta.env);

export const env = {
  apiUrl: parsed.VITE_API_URL,
  apiMocks: parsed.VITE_API_MOCKS,
} as const;
