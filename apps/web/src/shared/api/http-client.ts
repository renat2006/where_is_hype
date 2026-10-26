import type { z } from 'zod';

import { env } from '@/shared/config';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(`Request to ${path} failed with status ${String(status)}`);
    this.name = 'ApiError';
  }
}

export async function apiGet<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
  init?: RequestInit,
): Promise<z.infer<TSchema>> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');

  const response = await fetch(`${env.apiUrl}${path}`, { ...init, headers });

  if (!response.ok) {
    throw new ApiError(response.status, path);
  }

  return schema.parse(await response.json());
}
