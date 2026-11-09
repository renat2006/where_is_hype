import { z } from 'zod';

const rawEnvSchema = z.object({
  VITE_API_BASE_URL: z.string().optional(),
  VITE_API_URL: z.string().optional(),
  VITE_API_MOCKS: z.enum(['true', 'false']).optional(),
  PROD: z.boolean().optional(),
  MODE: z.string().optional(),
});

export interface AppEnv {
  readonly apiBaseUrl: string;
  readonly apiUrl: string;
  readonly apiMocks: boolean;
}

function normalizeBaseUrl(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const withoutTrailing = trimmed.replace(/\/+$/, '');
  return withoutTrailing.length > 0 ? withoutTrailing : '/api';
}

export function parseEnv(input: Record<string, unknown>): AppEnv {
  const parsed = rawEnvSchema.parse(input);
  const apiBaseUrl =
    normalizeBaseUrl(parsed.VITE_API_BASE_URL) ?? normalizeBaseUrl(parsed.VITE_API_URL) ?? '/api';

  const isProd = parsed.PROD === true || parsed.MODE === 'production';
  const apiMocks =
    parsed.VITE_API_MOCKS !== undefined ? parsed.VITE_API_MOCKS === 'true' : isProd ? false : false;

  return {
    apiBaseUrl,
    apiUrl: apiBaseUrl,
    apiMocks,
  };
}

export const env: AppEnv = parseEnv(import.meta.env);
